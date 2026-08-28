export type DetectedLoadItem = {
  name: string;
  cartons: number;
  hours: number;
  minutes: number;
};

const validSections = [
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

function normalizeSectionName(
  rawName: string
): string | null {
  const cleaned = rawName
    .trim()
    .replace(/\s+/g, ' ');

  const aisleMatch =
    cleaned.match(
      /aisle\s*0?(\d{1,2})/i
    );

  if (aisleMatch) {
    const aisleNumber =
      Number(aisleMatch[1]);

    if (
      aisleNumber >= 2 &&
      aisleNumber <= 15
    ) {
      return `Aisle ${aisleNumber}`;
    }
  }

  if (/promo/i.test(cleaned)) {
    return 'Promo';
  }

  if (
    /protect/i.test(cleaned)
  ) {
    return 'Protect - Aisle';
  }

  return null;
}

function parseExpectedTime(
  text: string
) {
  let hours = 0;
  let minutes = 0;

  const hourMatch =
    text.match(
      /(\d+)\s*h/i
    );

  const minuteMatch =
    text.match(
      /(\d+)\s*m/i
    );

  if (hourMatch) {
    hours =
      Number(hourMatch[1]);
  }

  if (minuteMatch) {
    minutes =
      Number(minuteMatch[1]);
  }

  /*
   * Fill Assist sometimes shows
   * only something like:
   *
   * 59m
   */

  return {
    hours,
    minutes,
  };
}

export function parseFillAssistText(
  rawText: string
): DetectedLoadItem[] {
  const lines = rawText
    .split('\n')
    .map((line) =>
      line.trim()
    )
    .filter(Boolean);

  const results:
    DetectedLoadItem[] = [];

  for (
    let index = 0;
    index < lines.length;
    index++
  ) {
    const currentLine =
      lines[index];

    const sectionName =
      normalizeSectionName(
        currentLine
      );

    if (!sectionName) {
      continue;
    }

    let cartons = 0;

    let hours = 0;

    let minutes = 0;

    /*
     * Look at the next several OCR
     * lines after the aisle name.
     */

    const nearbyLines =
      lines.slice(
        index + 1,
        index + 7
      );

    for (
      const nearbyLine of
      nearbyLines
    ) {
      /*
       * Detect expected time.
       */

      if (
        /\d+\s*h/i.test(
          nearbyLine
        ) ||
        /\d+\s*m/i.test(
          nearbyLine
        )
      ) {
        const parsed =
          parseExpectedTime(
            nearbyLine
          );

        if (
          parsed.hours > 0 ||
          parsed.minutes > 0
        ) {
          hours =
            parsed.hours;

          minutes =
            parsed.minutes;
        }

        continue;
      }

      /*
       * Carton count is normally a
       * standalone integer.
       *
       * We deliberately keep a
       * sensible limit to reduce OCR
       * mistakes.
       */

      const cartonMatch =
        nearbyLine.match(
          /^\s*(\d{1,4})\s*$/
        );

      if (
        cartonMatch &&
        cartons === 0
      ) {
        const possibleCartons =
          Number(
            cartonMatch[1]
          );

        if (
          possibleCartons >= 0 &&
          possibleCartons <=
            5000
        ) {
          cartons =
            possibleCartons;
        }
      }
    }

    if (
      cartons > 0 ||
      hours > 0 ||
      minutes > 0
    ) {
      const existing =
        results.find(
          (item) =>
            item.name ===
            sectionName
        );

      /*
       * If the same aisle appears
       * in overlapping photographs,
       * update it instead of creating
       * a duplicate.
       */

      if (existing) {
        if (cartons > 0) {
          existing.cartons =
            cartons;
        }

        if (
          hours > 0 ||
          minutes > 0
        ) {
          existing.hours =
            hours;

          existing.minutes =
            minutes;
        }
      } else {
        results.push({
          name: sectionName,
          cartons,
          hours,
          minutes,
        });
      }
    }
  }

  /*
   * Keep Fill Assist sections in
   * aisle order.
   */

  return results.sort(
    (a, b) => {
      const aIndex =
        validSections.indexOf(
          a.name
        );

      const bIndex =
        validSections.indexOf(
          b.name
        );

      return aIndex - bIndex;
    }
  );
}