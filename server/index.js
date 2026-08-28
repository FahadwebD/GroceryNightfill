import express from 'express';
import cors from 'cors';

import analyzeLoadRouter from './analyzeLoad.js';

const app = express();

const PORT =
  process.env.PORT || 4000;

/*
|--------------------------------------------------------------------------
| MIDDLEWARE
|--------------------------------------------------------------------------
*/

app.use(
  cors({
    origin: '*',
  })
);

app.use(
  express.json({
    limit: '20mb',
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: '20mb',
  })
);

/*
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
*/

app.get('/', (req, res) => {
  res.json({
    service: 'Grocery Nightfill OCR API',
    status: 'running',
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'grocery-nightfill-api',
    timestamp: new Date().toISOString(),
  });
});

/*
|--------------------------------------------------------------------------
| API
|--------------------------------------------------------------------------
*/

app.use(
  '/api',
  analyzeLoadRouter
);

/*
|--------------------------------------------------------------------------
| ERROR HANDLER
|--------------------------------------------------------------------------
*/

app.use((error, req, res, next) => {
  console.error(
    'SERVER ERROR:',
    error
  );

  res.status(500).json({
    success: false,
    message:
      'Internal server error',
  });
});

/*
|--------------------------------------------------------------------------
| SERVER
|--------------------------------------------------------------------------
*/

app.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      `Grocery Nightfill API running on port ${PORT}`
    );
  }
);