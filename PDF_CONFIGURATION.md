# PDF Generation Configuration

## Environment Variables

The PDF generation feature supports the following environment variables:

### PDF Generation Settings

```bash
# PDF Generation Timeout (milliseconds)
# Default: 60000 (60 seconds)
PDF_GENERATION_TIMEOUT=60000

# Number of retries for PDF generation
# Default: 2
PDF_GENERATION_RETRIES=2
```

### Example .env Configuration

```bash
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# PDF Generation (optional - uses defaults if not set)
PDF_GENERATION_TIMEOUT=60000
PDF_GENERATION_RETRIES=2
```

## Configuration Details

### PDF_GENERATION_TIMEOUT
- **Type**: Integer (milliseconds)
- **Default**: 60000 (60 seconds)
- **Description**: Maximum time allowed for PDF generation before timing out
- **Recommendation**: 
  - Development: 60000 (60 seconds)
  - Production: 60000-90000 (60-90 seconds) depending on server performance

### PDF_GENERATION_RETRIES
- **Type**: Integer
- **Default**: 2
- **Description**: Number of retry attempts if PDF generation fails
- **Recommendation**: 
  - Development: 1-2 retries
  - Production: 2-3 retries (balance between reliability and performance)

## Performance Tuning

### For High Traffic Environments

If you're experiencing high PDF generation load, consider:

1. **Increase Timeout**: Set `PDF_GENERATION_TIMEOUT=90000` for slower servers
2. **Reduce Retries**: Set `PDF_GENERATION_RETRIES=1` to fail faster under load
3. **Monitor Performance**: Check logs for PDF generation times

### For Development

```bash
# Faster failure for debugging
PDF_GENERATION_TIMEOUT=30000
PDF_GENERATION_RETRIES=1
```

## Troubleshooting

### PDF Generation Timeouts

If PDFs are timing out:

1. Check server resources (CPU, memory)
2. Increase `PDF_GENERATION_TIMEOUT`
3. Check network connectivity (for external resources)
4. Review logs for specific error messages

### PDF Generation Failures

If PDFs are failing:

1. Check Puppeteer installation: `npm list puppeteer`
2. Verify browser can launch: Check system dependencies
3. Review error logs for specific failure reasons
4. Ensure sufficient disk space for temporary files

## Browser Configuration

The PDF generator uses Puppeteer with the following browser arguments (configured in code):

- `--no-sandbox` - Required for some Linux environments
- `--disable-setuid-sandbox` - Security sandbox disable
- `--disable-dev-shm-usage` - Prevents shared memory issues
- `--disable-gpu` - Disables GPU acceleration
- `--disable-web-security` - Allows loading external resources
- `--disable-features=IsolateOrigins,site-per-process` - Performance optimization

These are optimized for server environments and should not be changed unless you understand the implications.

## Resource Handling

### External Resources

The PDF generator automatically handles:

1. **Fonts**: Inter font family (falls back to system fonts if download fails)
2. **Images**: Company logos (downloaded and embedded as base64)
3. **CSS**: Minimal TailwindCSS utilities (embedded, no CDN dependency)

### Network Requirements

For PDF generation to work optimally:

- Internet connection for downloading fonts/images (first time)
- After first download, resources are cached in memory
- PDF generation works offline if resources were previously downloaded

## Monitoring

### Logs

The PDF generator logs:

- PDF generation start/end times
- Generation duration
- Retry attempts
- Error messages with context

Example log output:
```
PDF generated successfully for invoice INV-001 in 2345ms (attempt 1)
PDF generation attempt 1 failed: Content loading timeout
Retrying in 1000ms...
PDF generated successfully for invoice INV-001 in 1890ms (attempt 2)
```

### Metrics to Monitor

- Average PDF generation time
- Success rate
- Timeout frequency
- Retry frequency
- Error types

## Security Considerations

1. **Share Tokens**: PDF generation uses the same share token validation as HTML view
2. **Resource Downloads**: External resources are downloaded with timeout protection
3. **Browser Sandbox**: Browser runs in headless mode with security flags
4. **File Access**: PDFs are generated in memory and streamed directly to client

## Future Enhancements

Potential improvements:

1. Browser instance pooling for high traffic
2. PDF caching for frequently accessed invoices
3. Background PDF generation queue
4. CDN integration for generated PDFs
5. PDF watermarking
6. PDF signing capabilities


