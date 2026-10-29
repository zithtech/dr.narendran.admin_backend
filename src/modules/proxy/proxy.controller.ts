import type { Request, Response } from 'express';
import { s3Service } from '@/modules/s3/s3.service.js';

/**
 * Universal Image Proxy
 * Fetches and streams images from AWS S3, Google Drive, or any external URL
 * bypassing CORS, hotlink protection, and private bucket access issues.
 */
export async function proxyImage(req: Request, res: Response): Promise<void> {
  const urlParam = req.query['url'];
  if (!urlParam || typeof urlParam !== 'string') {
    res.status(400).send('URL query parameter is required');
    return;
  }

  let rawUrl = urlParam.trim();
  if (!rawUrl) {
    res.status(400).send('Empty URL provided');
    return;
  }

  // Handle Google Drive file share links
  const gDriveMatch = rawUrl.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/i);
  if (gDriveMatch && gDriveMatch[1]) {
    rawUrl = `https://lh3.googleusercontent.com/d/${gDriveMatch[1]}`;
  }

  // 1. AWS S3 URL handling
  if (rawUrl.includes('amazonaws.com')) {
    const parts = rawUrl.split('.amazonaws.com/');
    if (parts[1]) {
      const key = parts[1].split('?')[0];
      if (key) {
        try {
          const { stream, contentType } = await s3Service.getObjectStream(decodeURIComponent(key));
          res.setHeader('Content-Type', contentType || 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          res.setHeader('Access-Control-Allow-Origin', '*');
          stream.pipe(res);
          return;
        } catch {
          try {
            const signedUrl = await s3Service.getReadUrl(decodeURIComponent(key), 86400);
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.redirect(signedUrl);
            return;
          } catch {
            // fallback to general fetch below
          }
        }
      }
    }
  }

  // 2. External HTTP/HTTPS URL handling
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      res.status(400).send('Unsupported protocol');
      return;
    }

    const response = await fetch(rawUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        Referer: parsed.origin,
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      res.status(response.status).send(`Failed to fetch image: ${response.statusText}`);
      return;
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // If an HTML preview/share page is returned, attempt to extract image meta tags
    if (contentType.includes('text/html')) {
      const htmlText = await response.text();
      const ogMatch =
        htmlText.match(/<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
        htmlText.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
      if (ogMatch && ogMatch[1]) {
        const ogUrl = ogMatch[1].replace(/&amp;/g, '&');
        try {
          const imgRes = await fetch(ogUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              Accept: 'image/*',
            },
            redirect: 'follow',
          });
          if (imgRes.ok) {
            const imgType = imgRes.headers.get('content-type') || 'image/jpeg';
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            res.setHeader('Content-Type', imgType);
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.send(buffer);
            return;
          }
        } catch {
          // ignore
        }
      }
      res.status(400).send('URL returned HTML without an embeddable image');
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(buffer);
  } catch (err: any) {
    res.status(502).send(`Proxy fetch failed: ${err.message}`);
  }
}
