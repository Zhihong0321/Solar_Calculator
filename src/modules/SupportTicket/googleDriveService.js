const jwt = require('jsonwebtoken');
const { storageDriver } = require('../../core/upload');

const DEFAULT_FOLDER_ID = '1wewcq9UiGs8WxJrvq-16qPjt-5CzzF8q';
const SHARED_FOLDER_URL = 'https://drive.google.com/drive/folders/1wewcq9UiGs8WxJrvq-16qPjt-5CzzF8q?usp=sharing';

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

  async getAccessToken() {
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;

    if (!clientEmail || !privateKeyRaw) {
      throw new Error('Google Drive service account credentials are not configured in environment variables');
    }

    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
    const now = Math.floor(Date.now() / 1000);

    const token = jwt.sign(
      {
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
      },
      privateKey,
      { algorithm: 'RS256' }
    );

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

  async uploadVideo({ buffer, originalname, mimeType, req }) {
    const filename = `ticket_video_${Date.now()}_${originalname || 'video.mp4'}`;
    const folderId = this.getFolderId();

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

        const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink', {
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
          throw new Error(`Google Drive upload failed: ${fileData.error?.message || uploadRes.status}`);
        }

        // Make file readable with link
        try {
          await fetch(`https://www.googleapis.com/drive/v3/files/${fileData.id}/permissions`, {
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
        console.error('[GoogleDrive] Upload to GDrive failed, falling back to storageDriver:', gdriveErr.message);
      }
    }

    // Fallback: Use standard storageDriver (R2 / disk storage)
    const stored = await storageDriver.put(buffer, {
      subdir: 'support_ticket_uploads',
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
