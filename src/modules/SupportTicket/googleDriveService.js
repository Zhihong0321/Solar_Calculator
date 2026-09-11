const jwt = require('jsonwebtoken');
const { storageDriver } = require('../../core/upload');
const edaStorage = require('../../core/upload/edaStorage');

const DEFAULT_FOLDER_ID = '1wewcq9UiGs8WxJrvq-16qPjt-5CzzF8q';
const SHARED_FOLDER_URL = 'https://drive.google.com/drive/folders/1wewcq9UiGs8WxJrvq-16qPjt-5CzzF8q?usp=sharing';
const EDA_SUBDIR = 'support_ticket_uploads';

/**
 * eter-drive-api has no public/anonymous read, so a stored object has no
 * browsable URL of its own — this app must proxy the read itself (see
 * supportTicketController.streamMedia).
 */
function buildEdaMediaUrl(req, filename) {
    const encoded = encodeURIComponent(filename);
    if (!req) return `/api/support-tickets/media/${encoded}`;
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    return `${proto}://${host}/api/support-tickets/media/${encoded}`;
}

class GoogleDriveService {
  getFolderId() {
    return process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;
  }

  getSharedFolderUrl() {
    return SHARED_FOLDER_URL;
  }

  hasCredentials() {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GOOGLE_PRIVATE_KEY;
    return Boolean(email && key);
  }

  hasEdaCredentials() {
    return edaStorage.hasCredentials();
  }

  async getAccessToken() {
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;
    const delegatedUser = process.env.GOOGLE_DRIVE_DELEGATED_USER;

    if (!clientEmail || !privateKeyRaw) {
      throw new Error('Google Drive service account credentials are not configured in environment variables');
    }

    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
    const now = Math.floor(Date.now() / 1000);

    const payload = {
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };

    if (delegatedUser) {
      payload.sub = delegatedUser;
    }

    const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: token,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Google Auth error: ${data.error_description || data.error || response.status}`);
    }

    return data.access_token;
  }

  async uploadVideo({ buffer, originalname, mimeType, req, folderId: customFolderId, filenamePrefix, customFilename, subdir, strict = false }) {
    const prefix = filenamePrefix || 'ticket_video';
    const filename = customFilename || `${prefix}_${Date.now()}_${originalname || 'video.mp4'}`;
    const folderId = customFolderId || this.getFolderId();

    // If Google Service Account is configured, upload directly to Google Drive
    if (this.hasCredentials()) {
      try {
        const accessToken = await this.getAccessToken();
        const metadata = {
          name: filename,
          parents: folderId ? [folderId] : [],
        };

        const boundary = '-------' + Math.random().toString(36).substring(2);
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelimiter = `\r\n--${boundary}--`;

        const multipartRequestBody = Buffer.concat([
          Buffer.from(
            `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n` +
            JSON.stringify(metadata) +
            `${delimiter}Content-Type: ${mimeType || 'video/mp4'}\r\n\r\n`
          ),
          buffer,
          Buffer.from(closeDelimiter),
        ]);

        const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink,webContentLink', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
            'Content-Length': String(multipartRequestBody.length),
          },
          body: multipartRequestBody,
        });

        const fileData = await uploadRes.json();
        if (!uploadRes.ok) {
          const apiMsg = fileData.error?.message || uploadRes.status;
          if (String(apiMsg).includes('storage quota')) {
            throw new Error(`Google Drive upload failed: Service Accounts do not have personal storage quota. The target folder must be inside a Google Workspace Shared Drive with the service account added as Content Manager, or Domain-Wide Delegation must be enabled.`);
          }
          throw new Error(`Google Drive upload failed: ${apiMsg}`);
        }

        // Make file readable with link
        try {
          await fetch(`https://www.googleapis.com/drive/v3/files/${fileData.id}/permissions?supportsAllDrives=true`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              role: 'reader',
              type: 'anyone',
            }),
          });
        } catch (permErr) {
          console.warn('[GoogleDrive] Could not set public view permission:', permErr.message);
        }

        const driveUrl = fileData.webViewLink || `https://drive.google.com/file/d/${fileData.id}/view`;
        return {
          source: 'google_drive',
          url: driveUrl,
          fileId: fileData.id,
        };
      } catch (gdriveErr) {
        console.error('[GoogleDrive] Upload to GDrive failed:', gdriveErr.message);
        if (strict) {
          throw gdriveErr;
        }
      }
    }

    // Eter Drive API (S3-compatible storage) — the current default video
    // backend now that no Google service account is configured.
    if (this.hasEdaCredentials()) {
      try {
        const key = `${EDA_SUBDIR}/${filename}`;
        const { endpoint } = await edaStorage.uploadBuffer(buffer, key, mimeType || 'video/mp4');
        return {
          source: 'eter_drive_api',
          url: buildEdaMediaUrl(req, filename),
          key,
          endpoint,
        };
      } catch (edaErr) {
        console.error('[EterDriveApi] Upload failed:', edaErr.message);
        if (strict) {
          throw edaErr;
        }
      }
    } else if (strict) {
      throw new Error('No video storage backend is configured (Google Drive service account or Eter Drive API)');
    }

    // Fallback: Use standard storageDriver (R2 / disk storage)
    const stored = await storageDriver.put(buffer, {
      subdir: subdir || 'support_ticket_uploads',
      filename,
      mimeType: mimeType || 'video/mp4',
      req,
    });

    return {
      source: 'storage_driver',
      url: stored.url,
    };
  }
}

module.exports = new GoogleDriveService();
