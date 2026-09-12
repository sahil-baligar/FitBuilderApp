import express from 'express';
import apiRouter from './api';

export const createApiServer = () => {
  const app = express();
  app.use('/api', apiRouter);
  return app;
};


