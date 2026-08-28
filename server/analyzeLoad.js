import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';

const router = express.Router();

/*
|--------------------------------------------------------------------------
| FOLDERS
|--------------------------------------------------------------------------
*/

const uploadFolder = path.join(
  process.cwd(),
  'uploads'
);

const processedFolder = path.join(
  uploadFolder,
  'processed'
);

for (const folder of [
  uploadFolder,
  processedFolder,
]) {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, {
      recursive: true,
    });
  }
}

/*
|--------------------------------------------------------------------------
| FILL ASSIST SECTIONS
|--------------------------------------------------------------------------
*/

const SECTION_ORDER = [
  'Aisle 2',
  'Aisle 3',
  'Aisle 4',
  'Aisle 5',
  'Aisle 6',
  'Aisle 7',
  'Aisle 8',
  'Aisle 9',
  'Aisle 10',
  'Aisle 11',
  'Aisle 12',
  'Aisle 13',
  'Aisle 14',
  'Aisle 15',
  'Promo',
  'Protect - Aisle',
];

/*
|--------------------------------------------------------------------------
| MULTER
|--------------------------------------------------------------------------
*/

const storage = multer.diskStorage({
  destination: (
    req,
    file,
    callback
  ) => {
    callback(
      null,
      uploadFolder
    );
  },

  filename: (
    req,
    file,
    callback
  ) => {
    const extension =
      path.extname(
        file.originalname
      ) || '.jpg';

    callback(
      null,
      `fill-assist-${Date.now()}-${Math.round(
        Math.random() * 1000000
      )}${extension}`
    );
  },
});

const upload = multer({
  storage,

  limits: {
    files: 10,
    fileSize:
      15 * 1024 * 1024,
  },

  fileFilter: (
    req,
    file,
    callback
  ) => {
    if (
      file.mimetype.startsWith(
        'image/'
      )
    ) {
      callback(
        null,
        true
      );

      return;
    }

    callback(
      new Error(
        'Only image files are allowed.'
      )
    );
  },
});

/*
|--------------------------------------------------------------------------
| OCR CLEANING
|--------------------------------------------------------------------------
*/

function cleanOCRLine(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/[|]/g, 'I')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeOCRText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(cleanOCRLine)
    .filter(Boolean);
}

/*
|--------------------------------------------------------------------------
| SECTION NORMALIZATION
|--------------------------------------------------------------------------
*/

function normalizeSectionName(text) {
  if (!text) {
    return null;
  }

  let cleaned =
    cleanOCRLine(text);

  /*
   * Common Tesseract mistakes.
   */

  cleaned = cleaned
    .replace(
      /\baisie\b/gi,
      'aisle'
    )
    .replace(
      /\bais1e\b/gi,
      'aisle'
    )
    .replace(
      /\balsle\b/gi,
      'aisle'
    )
    .replace(
      /\ba[s5]le\b/gi,
      'aisle'
    );

  const aisleMatch =
    cleaned.match(
      /aisle\s*[:\-]?\s*[oO0]?\s*(\d{1,2})/i
    );

  if (aisleMatch) {
    const aisleNumber =
      Number(
        aisleMatch[1]
      );

    if (
      aisleNumber >= 2 &&
      aisleNumber <= 15
    ) {
      return `Aisle ${aisleNumber}`;
    }
  }

  if (
    /\bpromo\b/i.test(
      cleaned
    )
  ) {
    return 'Promo';
  }

  if (
    /\bprotect\b/i.test(
      cleaned
    )
  ) {
    return 'Protect - Aisle';
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| NUMBERS
|--------------------------------------------------------------------------
*/

function cleanNumericText(text) {
  return String(text || '')
    .trim()
    .replace(/[Oo]/g, '0')
    .replace(/[Il]/g, '1');
}

function parseStandaloneNumber(text) {
  const cleaned =
    cleanNumericText(
      text
    );

  const match =
    cleaned.match(
      /^(\d{1,4})$/
    );

  if (!match) {
    return null;
  }

  const value =
    Number(
      match[1]
    );

  if (
    !Number.isFinite(value) ||
    value < 1 ||
    value > 3000
  ) {
    return null;
  }

  return value;
}

/*
|--------------------------------------------------------------------------
| TIME PARSER
|--------------------------------------------------------------------------
*/

function parseTime(text) {
  if (!text) {
    return null;
  }

  let cleaned =
    cleanOCRLine(text);

  /*
   * Correct some common OCR mistakes.
   */

  cleaned = cleaned
    .replace(/[Oo]/g, '0')
    .replace(
      /(\d)\s*[Hh]\b/g,
      '$1h'
    )
    .replace(
      /(\d)\s*[Mm]\b/g,
      '$1m'
    );

  /*
   * 3h 25m
   */

  const fullTime =
    cleaned.match(
      /(\d{1,3})\s*h\s*(\d{1,2})\s*m/i
    );

  if (fullTime) {
    const hours =
      Number(
        fullTime[1]
      );

    const minutes =
      Number(
        fullTime[2]
      );

    if (
      hours >= 0 &&
      hours <= 100 &&
      minutes >= 0 &&
      minutes <= 59
    ) {
      return {
        hours,
        minutes,
        totalMinutes:
          hours * 60 +
          minutes,
      };
    }
  }

  /*
   * 45m
   */

  const minutesOnly =
    cleaned.match(
      /(?:^|\s)(\d{1,3})\s*m(?:\s|$)/i
    );

  if (minutesOnly) {
    const minutes =
      Number(
        minutesOnly[1]
      );

    /*
     * Convert values above
     * 59 minutes if necessary.
     */

    if (
      minutes >= 0 &&
      minutes <= 600
    ) {
      return {
        hours:
          Math.floor(
            minutes / 60
          ),

        minutes:
          minutes % 60,

        totalMinutes:
          minutes,
      };
    }
  }

  /*
   * 28h
   */

  const hoursOnly =
    cleaned.match(
      /(?:^|\s)(\d{1,3})\s*h(?:\s|$)/i
    );

  if (hoursOnly) {
    const hours =
      Number(
        hoursOnly[1]
      );

    if (
      hours >= 0 &&
      hours <= 100
    ) {
      return {
        hours,
        minutes: 0,
        totalMinutes:
          hours * 60,
      };
    }
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| TOTAL FILL ASSIST TIME
|--------------------------------------------------------------------------
*/

function detectTotalRequiredMinutes(
  lines
) {
  const totalKeywords = [
    /total.*(?:hour|time|required|expected)/i,
    /(?:hour|time|required|expected).*total/i,
    /total.*fill/i,
    /fill.*total/i,
    /total.*grocery/i,
  ];

  /*
   * First search for a line that
   * contains both a total label
   * and the time.
   *
   * Example:
   *
   * Total Expected 27h 35m
   */

  for (
    let index = 0;
    index < lines.length;
    index++
  ) {
    const line =
      lines[index];

    const isTotalLine =
      totalKeywords.some(
        (pattern) =>
          pattern.test(
            line
          )
      );

    if (!isTotalLine) {
      continue;
    }

    const sameLineTime =
      parseTime(
        line
      );

    if (
      sameLineTime &&
      sameLineTime.totalMinutes >
        0
    ) {
      console.log(
        'TOTAL TIME DETECTED:',
        line,
        sameLineTime
      );

      return sameLineTime.totalMinutes;
    }

    /*
     * Sometimes the label and time
     * are on separate OCR lines.
     */

    for (
      let offset = 1;
      offset <= 4;
      offset++
    ) {
      const nearby =
        lines[
          index + offset
        ];

      if (!nearby) {
        break;
      }

      const time =
        parseTime(
          nearby
        );

      if (
        time &&
        time.totalMinutes >
          0
      ) {
        console.log(
          'TOTAL TIME DETECTED NEAR:',
          line,
          nearby,
          time
        );

        return time.totalMinutes;
      }
    }
  }

  return 0;
}

/*
|--------------------------------------------------------------------------
| SPLITTING TIME
|--------------------------------------------------------------------------
*/

function detectSplittingMinutes(
  lines
) {
  for (
    let index = 0;
    index < lines.length;
    index++
  ) {
    const line =
      lines[index];

    /*
     * Accept:
     *
     * Splitting
     * Split
     * Split Time
     * Splitting Time
     */

    const isSplitting =
      /\bsplitt?ing\b/i.test(
        line
      ) ||
      /\bsplit\s*(?:time|hours?)?\b/i.test(
        line
      );

    if (!isSplitting) {
      continue;
    }

    /*
     * Same line:
     *
     * Splitting 2h 30m
     */

    const sameLineTime =
      parseTime(
        line
      );

    if (
      sameLineTime &&
      sameLineTime.totalMinutes >
        0
    ) {
      console.log(
        'SPLITTING DETECTED:',
        line,
        sameLineTime
      );

      return sameLineTime.totalMinutes;
    }

    /*
     * Next few lines.
     */

    for (
      let offset = 1;
      offset <= 4;
      offset++
    ) {
      const nearby =
        lines[
          index + offset
        ];

      if (!nearby) {
        break;
      }

      /*
       * Stop if another aisle begins.
       */

      if (
        normalizeSectionName(
          nearby
        )
      ) {
        break;
      }

      const time =
        parseTime(
          nearby
        );

      if (
        time &&
        time.totalMinutes >
          0
      ) {
        console.log(
          'SPLITTING TIME DETECTED NEAR:',
          line,
          nearby,
          time
        );

        return time.totalMinutes;
      }
    }
  }

  return 0;
}

/*
|--------------------------------------------------------------------------
| IMAGE PREPROCESSING
|--------------------------------------------------------------------------
*/

async function preprocessImage(
  sourcePath,
  imageIndex
) {
  const outputPath =
    path.join(
      processedFolder,
      `processed-${Date.now()}-${imageIndex}.png`
    );

  const metadata =
    await sharp(
      sourcePath
    ).metadata();

  const originalWidth =
    metadata.width || 1000;

  const targetWidth =
    Math.min(
      Math.max(
        originalWidth * 2,
        1800
      ),
      3000
    );

  await sharp(
    sourcePath
  )
    .rotate()
    .resize({
      width:
        Math.round(
          targetWidth
        ),

      withoutEnlargement:
        false,
    })
    .grayscale()
    .normalize()
    .sharpen({
      sigma: 1.2,
    })
    .png()
    .toFile(
      outputPath
    );

  return outputPath;
}

/*
|--------------------------------------------------------------------------
| PARSE AISLES FROM ONE PHOTO
|--------------------------------------------------------------------------
*/

function parseSinglePhoto(
  rawText
) {
  const lines =
    normalizeOCRText(
      rawText
    );

  const detected = [];

  console.log(
    '\nNORMALIZED OCR LINES:'
  );

  lines.forEach(
    (line, index) => {
      console.log(
        index,
        line
      );
    }
  );

  for (
    let index = 0;
    index < lines.length;
    index++
  ) {
    const sectionName =
      normalizeSectionName(
        lines[index]
      );

    if (!sectionName) {
      continue;
    }

    console.log(
      'FOUND SECTION:',
      sectionName
    );

    let cartons = 0;
    let hours = 0;
    let minutes = 0;

    let cartonFound =
      false;

    let timeFound =
      false;

    for (
      let offset = 1;
      offset <= 8;
      offset++
    ) {
      const line =
        lines[
          index + offset
        ];

      if (!line) {
        break;
      }

      /*
       * Stop at next section.
       */

      const nextSection =
        normalizeSectionName(
          line
        );

      if (nextSection) {
        break;
      }

      /*
       * Don't accidentally use
       * splitting or total time
       * as an aisle time.
       */

      if (
        /\bsplitt?ing\b/i.test(
          line
        ) ||
        /\bsplit\s*time\b/i.test(
          line
        ) ||
        /\btotal\b/i.test(
          line
        )
      ) {
        continue;
      }

      /*
       * TIME
       */

      if (!timeFound) {
        const parsedTime =
          parseTime(
            line
          );

        if (parsedTime) {
          /*
           * Individual aisle times
           * should be reasonable.
           */

          if (
            parsedTime.totalMinutes <=
            12 * 60
          ) {
            hours =
              parsedTime.hours;

            minutes =
              parsedTime.minutes;

            timeFound =
              true;

            continue;
          }
        }
      }

      /*
       * Ignore obvious labels.
       */

      if (
        /expected/i.test(
          line
        ) ||
        /carton/i.test(
          line
        ) ||
        /aisle/i.test(
          line
        )
      ) {
        continue;
      }

      /*
       * CARTONS
       */

      if (!cartonFound) {
        const number =
          parseStandaloneNumber(
            line
          );

        if (
          number !== null
        ) {
          cartons =
            number;

          cartonFound =
            true;
        }
      }

      if (
        cartonFound &&
        timeFound
      ) {
        break;
      }
    }

    if (
      cartons === 0 &&
      hours === 0 &&
      minutes === 0
    ) {
      continue;
    }

    detected.push({
      name:
        sectionName,

      cartons,

      hours,

      minutes,
    });
  }

  return {
    detected,

    totalRequiredMinutes:
      detectTotalRequiredMinutes(
        lines
      ),

    splittingMinutes:
      detectSplittingMinutes(
        lines
      ),
  };
}

/*
|--------------------------------------------------------------------------
| MERGE AISLES
|--------------------------------------------------------------------------
*/

function mergeDetectedItems(
  allDetected
) {
  const merged = [];

  for (
    const item of allDetected
  ) {
    const existing =
      merged.find(
        (saved) =>
          saved.name ===
          item.name
      );

    if (!existing) {
      merged.push({
        ...item,
      });

      continue;
    }

    if (
      item.cartons > 0
    ) {
      existing.cartons =
        item.cartons;
    }

    if (
      item.hours > 0 ||
      item.minutes > 0
    ) {
      existing.hours =
        item.hours;

      existing.minutes =
        item.minutes;
    }
  }

  merged.sort(
    (a, b) =>
      SECTION_ORDER.indexOf(
        a.name
      ) -
      SECTION_ORDER.indexOf(
        b.name
      )
  );

  return merged;
}

/*
|--------------------------------------------------------------------------
| CALCULATE WORK BUCKETS
|--------------------------------------------------------------------------
*/

function calculateWorkSummary(
  detected,
  totalRequiredMinutes,
  splittingMinutes
) {
  let aisleMinutes = 0;
  let promoMinutes = 0;
  let protectMinutes = 0;

  for (
    const item of detected
  ) {
    const minutes =
      (Number(
        item.hours
      ) || 0) *
        60 +
      (Number(
        item.minutes
      ) || 0);

    if (
      item.name ===
      'Promo'
    ) {
      promoMinutes +=
        minutes;

      continue;
    }

    if (
      item.name ===
      'Protect - Aisle'
    ) {
      protectMinutes +=
        minutes;

      continue;
    }

    if (
      item.name.startsWith(
        'Aisle '
      )
    ) {
      aisleMinutes +=
        minutes;
    }
  }

  const knownWorkMinutes =
    aisleMinutes +
    promoMinutes +
    protectMinutes +
    splittingMinutes;

  /*
   * Remaining labour.
   *
   * This can represent:
   *
   * organising
   * staging
   * cleanup
   * backstock
   * miscellaneous nightfill work
   */

  const otherOrganisingMinutes =
    totalRequiredMinutes > 0
      ? Math.max(
          totalRequiredMinutes -
            knownWorkMinutes,
          0
        )
      : 0;

  const calculatedTotalMinutes =
    knownWorkMinutes +
    otherOrganisingMinutes;

  return {
    aisleMinutes,

    promoMinutes,

    protectMinutes,

    splittingMinutes,

    otherOrganisingMinutes,

    knownWorkMinutes,

    calculatedTotalMinutes,
  };
}

/*
|--------------------------------------------------------------------------
| OCR
|--------------------------------------------------------------------------
*/

async function recognizeImage(
  worker,
  imagePath
) {
  const result =
    await worker.recognize(
      imagePath
    );

  return (
    result.data.text ||
    ''
  );
}

/*
|--------------------------------------------------------------------------
| DELETE TEMP FILEContinue the same file from `DELETE TEMP FILE`. The previous message was cut off. Paste this directly after that point:

```js
|--------------------------------------------------------------------------
*/

function deleteFile(
  filePath
) {
  try {
    if (
      filePath &&
      fs.existsSync(filePath)
    ) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.log(
      'FILE DELETE ERROR:',
      error
    );
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/analyze-load
|--------------------------------------------------------------------------
*/

router.post(
  '/analyze-load',

  upload.array(
    'photos',
    10
  ),

  async (req, res) => {
    const files =
      Array.isArray(req.files)
        ? req.files
        : [];

    const processedFiles = [];

    let worker = null;

    try {
      if (files.length === 0) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              'No Fill Assist photos uploaded.',
          });
      }

      console.log(
        '\n================================'
      );

      console.log(
        `Received ${files.length} Fill Assist photo(s)`
      );

      console.log(
        '================================\n'
      );

      worker =
        await createWorker(
          'eng'
        );

      const allDetected = [];

      /*
       * We may detect Total and
       * Splitting in more than one
       * overlapping photo.
       *
       * Keep the strongest useful
       * value.
       */

      let totalRequiredMinutes = 0;
      let splittingMinutes = 0;

      for (
        let index = 0;
        index < files.length;
        index++
      ) {
        const file =
          files[index];

        console.log(
          `PHOTO ${index + 1}/${files.length}`
        );

        /*
         * PREPROCESS
         */

        const processedPath =
          await preprocessImage(
            file.path,
            index
          );

        processedFiles.push(
          processedPath
        );

        /*
         * OCR
         */

        const processedText =
          await recognizeImage(
            worker,
            processedPath
          );

        console.log(
          '\n--- OCR PREPROCESSED ---\n'
        );

        console.log(
          processedText
        );

        let parsed =
          parseSinglePhoto(
            processedText
          );

        /*
         * FALLBACK
         *
         * If preprocessing detects
         * nothing useful, try the
         * original image.
         */

        const processedHasUsefulData =
          parsed.detected.length > 0 ||
          parsed.totalRequiredMinutes >
            0 ||
          parsed.splittingMinutes >
            0;

        if (
          !processedHasUsefulData
        ) {
          console.log(
            'Processed image found no useful Fill Assist data.'
          );

          console.log(
            'Trying original image...'
          );

          const originalText =
            await recognizeImage(
              worker,
              file.path
            );

          console.log(
            '\n--- OCR ORIGINAL ---\n'
          );

          console.log(
            originalText
          );

          parsed =
            parseSinglePhoto(
              originalText
            );
        }

        console.log(
          `PHOTO ${index + 1} AISLES:`,
          parsed.detected
        );

        console.log(
          `PHOTO ${index + 1} TOTAL:`,
          parsed.totalRequiredMinutes,
          'minutes'
        );

        console.log(
          `PHOTO ${index + 1} SPLITTING:`,
          parsed.splittingMinutes,
          'minutes'
        );

        allDetected.push(
          ...parsed.detected
        );

        /*
         * Total should normally be
         * the largest overall labour
         * number detected.
         */

        if (
          parsed.totalRequiredMinutes >
          totalRequiredMinutes
        ) {
          totalRequiredMinutes =
            parsed.totalRequiredMinutes;
        }

        /*
         * Splitting is one specific
         * work bucket.
         *
         * Overlapping screenshots
         * should not be added together.
         */

        if (
          parsed.splittingMinutes >
          splittingMinutes
        ) {
          splittingMinutes =
            parsed.splittingMinutes;
        }
      }

      /*
       * MERGE AISLES
       */

      const detected =
        mergeDetectedItems(
          allDetected
        );

      /*
       * CARTONS
       */

      const totalCartons =
        detected.reduce(
          (total, item) =>
            total +
            (Number(
              item.cartons
            ) || 0),
          0
        );

      /*
       * If OCR failed to read the
       * printed overall total, we
       * still calculate the detected
       * work total.
       */

      const detectedSectionMinutes =
        detected.reduce(
          (total, item) =>
            total +
            (Number(
              item.hours
            ) || 0) *
              60 +
            (Number(
              item.minutes
            ) || 0),
          0
        );

      /*
       * If no printed total was found,
       * use detected sections +
       * splitting as a fallback.
       *
       * The app can flag this because
       * totalWasDetected will be false.
       */

      const totalWasDetected =
        totalRequiredMinutes > 0;

      if (
        totalRequiredMinutes === 0
      ) {
        totalRequiredMinutes =
          detectedSectionMinutes +
          splittingMinutes;
      }

      /*
       * WORK SUMMARY
       */

      const workSummary =
        calculateWorkSummary(
          detected,
          totalRequiredMinutes,
          splittingMinutes
        );

      /*
       * CONSISTENCY CHECK
       */

      const allocatedKnownMinutes =
        workSummary.aisleMinutes +
        workSummary.promoMinutes +
        workSummary.protectMinutes +
        workSummary.splittingMinutes;

      const differenceMinutes =
        totalRequiredMinutes -
        allocatedKnownMinutes;

      const possibleOCRProblem =
        differenceMinutes < 0;

      console.log(
        '\n================================'
      );

      console.log(
        'FINAL FILL ASSIST RESULT'
      );

      console.log(
        'Detected sections:',
        detected
      );

      console.log(
        'Cartons:',
        totalCartons
      );

      console.log(
        'Printed total:',
        totalRequiredMinutes,
        'minutes'
      );

      console.log(
        'Aisle:',
        workSummary.aisleMinutes,
        'minutes'
      );

      console.log(
        'Promo:',
        workSummary.promoMinutes,
        'minutes'
      );

      console.log(
        'Protect:',
        workSummary.protectMinutes,
        'minutes'
      );

      console.log(
        'Splitting:',
        workSummary.splittingMinutes,
        'minutes'
      );

      console.log(
        'Other / Organising:',
        workSummary.otherOrganisingMinutes,
        'minutes'
      );

      console.log(
        'OCR warning:',
        possibleOCRProblem
      );

      console.log(
        '================================\n'
      );

      return res.json({
        success: true,

        photoCount:
          files.length,

        detected,

        totals: {
          cartons:
            totalCartons,

          totalRequiredMinutes,

          totalRequiredHours:
            Number(
              (
                totalRequiredMinutes /
                60
              ).toFixed(2)
            ),

          totalWasDetected,

          aisleMinutes:
            workSummary.aisleMinutes,

          promoMinutes:
            workSummary.promoMinutes,

          protectMinutes:
            workSummary.protectMinutes,

          splittingMinutes:
            workSummary.splittingMinutes,

          otherOrganisingMinutes:
            workSummary.otherOrganisingMinutes,
        },

        validation: {
          possibleOCRProblem,

          differenceMinutes,

          message:
            possibleOCRProblem
              ? 'Detected work exceeds the Fill Assist total. Please review the OCR values.'
              : totalWasDetected
                ? 'Fill Assist total detected.'
                : 'Overall Fill Assist total was not detected. Total was estimated from detected work.',
        },
      });
    } catch (error) {
      console.error(
        '\nANALYZE LOAD ERROR:',
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            error?.message ||
            'Could not analyze Fill Assist photos.',
        });
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch {}
      }

      for (
        const file of files
      ) {
        deleteFile(
          file.path
        );
      }

      for (
        const processedPath of
        processedFiles
      ) {
        deleteFile(
          processedPath
        );
      }
    }
  }
);

export default router;