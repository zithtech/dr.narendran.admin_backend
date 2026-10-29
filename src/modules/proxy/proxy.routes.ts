import { Router } from 'express';
import { proxyImage } from './proxy.controller.js';

export const proxyRouter = Router();

// Public unauthenticated image proxy route
proxyRouter.get('/image', proxyImage);
