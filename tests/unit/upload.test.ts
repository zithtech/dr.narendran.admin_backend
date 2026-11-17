import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { uploadImage } from '../../src/modules/upload/upload.controller.js';
import { s3Service } from '../../src/modules/s3/s3.service.js';

describe('uploadImage controller', () => {
  it('throws ValidationError if no file is provided', async () => {
    const req = {
      file: undefined,
      body: {},
      query: {},
    } as unknown as Request;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;

    await expect(uploadImage(req, res)).rejects.toThrow('No image file provided for upload.');
  });

  it('throws ValidationError if file format is not an image', async () => {
    const req = {
      file: {
        mimetype: 'application/pdf',
        size: 1024,
      },
      body: {},
      query: {},
    } as unknown as Request;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;

    await expect(uploadImage(req, res)).rejects.toThrow('Unsupported image format');
  });

  it('uploads valid image to S3 and returns success response', async () => {
    const uploadBufferSpy = vi.spyOn(s3Service, 'uploadBuffer').mockResolvedValueOnce({
      fileUrl: 'https://bucket.s3.ap-south-2.amazonaws.com/uploads/doctor-profiles/123_doctor.jpg',
      key: 'uploads/doctor-profiles/123_doctor.jpg',
    });

    const req = {
      file: {
        originalname: 'doctor.jpg',
        mimetype: 'image/jpeg',
        size: 5000,
        buffer: Buffer.from('fake-image-bytes'),
      },
      body: { folder: 'doctor-profiles' },
      query: {},
    } as unknown as Request;

    const jsonMock = vi.fn();
    const res = {
      status: vi.fn().mockReturnValue({ json: jsonMock }),
    } as unknown as Response;

    await uploadImage(req, res);

    expect(uploadBufferSpy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        data: expect.objectContaining({
          url: 'https://bucket.s3.ap-south-2.amazonaws.com/uploads/doctor-profiles/123_doctor.jpg',
          key: 'uploads/doctor-profiles/123_doctor.jpg',
          originalName: 'doctor.jpg',
          mimeType: 'image/jpeg',
        }),
      })
    );
  });
});
