import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';

import {
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

type LoadItem = {
  name: string;
  cartons: string;
  hours: string;
  minutes: string;
};

type DetectedItem = {
  name: string;
  cartons: number;
  hours: number;
  minutes: number;
};

type OCRTotals = {
  cartons: number;
  totalRequiredMinutes: number;
  totalRequiredHours: number;
  totalWasDetected: boolean;
  aisleMinutes: number;
  promoMinutes: number;
  protectMinutes: number;
  splittingMinutes: number;
  otherOrganisingMinutes: number;
};

type OCRValidation = {
  possibleOCRProblem: boolean;
  differenceMinutes: number;
  message: string;
};

type NightLoad = {
  day: string;
  photos: string[];
  items: LoadItem[];

  totalCartons: number;

  totalRequiredMinutes: number;
  aisleMinutes: number;
  promoMinutes: number;
  protectMinutes: number;

  splittingMinutes: number;
  splittingHours: string;
  splittingMinuteInput: string;

  otherOrganisingMinutes: number;

  totalWasDetected: boolean;

  updatedAt: string;
};

const loadSections = [
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

function createInitialItems(): LoadItem[] {
  return loadSections.map((name) => ({
    name,
    cartons: '',
    hours: '',
    minutes: '',
  }));
}

function getNightfillDate() {
  const now = new Date();
  const nightfillDate = new Date(now);

  if (nightfillDate.getHours() < 5) {
    nightfillDate.setDate(
      nightfillDate.getDate() - 1
    );
  }

  return nightfillDate;
}

function getNightfillDay() {
  return getNightfillDate().toLocaleDateString(
    'en-AU',
    {
      weekday: 'long',
    }
  );
}

function getBackendUrl() {
  const hostUri =
    Constants.expoConfig?.hostUri;

  if (!hostUri) {
    return 'http://localhost:4000';
  }

  const host =
    hostUri.split(':')[0];

  return `http://${host}:4000`;
}

function formatMinutes(
  totalMinutes: number
) {
  const safeMinutes =
    Math.max(
      Math.round(totalMinutes || 0),
      0
    );

  const hours =
    Math.floor(
      safeMinutes / 60
    );

  const minutes =
    safeMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

export default function ScanLoadScreen() {
  const nightfillDay =
    getNightfillDay();

  const backendUrl =
    useMemo(
      () => getBackendUrl(),
      []
    );

  const [photos, setPhotos] =
    useState<string[]>([]);

  const [items, setItems] =
    useState<LoadItem[]>(
      createInitialItems()
    );

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [analyzing, setAnalyzing] =
    useState(false);

  const [
    lastDetectedCount,
    setLastDetectedCount,
  ] = useState(0);

  const [
    ocrTotals,
    setOcrTotals,
  ] = useState<OCRTotals | null>(
    null
  );

  const [
    validation,
    setValidation,
  ] =
    useState<OCRValidation | null>(
      null
    );

  /*
   * SPLITTING IS EDITABLE
   */

  const [
    splittingHours,
    setSplittingHours,
  ] = useState('');

  const [
    splittingMinutesInput,
    setSplittingMinutesInput,
  ] = useState('');

  useEffect(() => {
    loadExistingLoad();
  }, []);

  async function loadExistingLoad() {
    try {
      const stored =
        await AsyncStorage.getItem(
          'groceryNightLoads'
        );

      if (!stored) {
        return;
      }

      const loads: Record<
        string,
        NightLoad
      > = JSON.parse(stored);

      const existing =
        loads[nightfillDay];

      if (!existing) {
        return;
      }

      setPhotos(
        existing.photos || []
      );

      if (
        existing.items &&
        existing.items.length > 0
      ) {
        const merged =
          createInitialItems().map(
            (defaultItem) => {
              const saved =
                existing.items.find(
                  (item) =>
                    item.name ===
                    defaultItem.name
                );

              return saved || defaultItem;
            }
          );

        setItems(merged);
      }

      const existingSplitting =
        existing.splittingMinutes || 0;

      setSplittingHours(
        existing.splittingHours ??
          String(
            Math.floor(
              existingSplitting / 60
            )
          )
      );

      setSplittingMinutesInput(
        existing.splittingMinuteInput ??
          String(
            existingSplitting % 60
          )
      );

      setOcrTotals({
        cartons:
          existing.totalCartons || 0,

        totalRequiredMinutes:
          existing.totalRequiredMinutes ||
          0,

        totalRequiredHours:
          (existing.totalRequiredMinutes ||
            0) / 60,

        totalWasDetected:
          existing.totalWasDetected ||
          false,

        aisleMinutes:
          existing.aisleMinutes || 0,

        promoMinutes:
          existing.promoMinutes || 0,

        protectMinutes:
          existing.protectMinutes || 0,

        splittingMinutes:
          existingSplitting,

        otherOrganisingMinutes:
          existing.otherOrganisingMinutes ||
          0,
      });
    } catch (error) {
      console.log(
        'LOAD EXISTING LOAD ERROR:',
        error
      );
    } finally {
      setLoading(false);
    }
  }

  async function takePhoto() {
    try {
      const permission =
        await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Camera Permission Required',
          'Please allow camera access.'
        );

        return;
      }

      const result =
        await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 1,
        });

      if (
        !result.canceled &&
        result.assets.length > 0
      ) {
        setPhotos((previous) => [
          ...previous,
          result.assets[0].uri,
        ]);

        setLastDetectedCount(0);
        setValidation(null);
      }
    } catch (error) {
      console.log(
        'CAMERA ERROR:',
        error
      );

      Alert.alert(
        'Camera Error',
        'Could not open the camera.'
      );
    }
  }

  async function choosePhotos() {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Photo Permission Required',
          'Please allow access to your photos.'
        );

        return;
      }

      const result =
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsMultipleSelection: true,
          selectionLimit: 10,
          quality: 1,
        });

      if (
        !result.canceled &&
        result.assets.length > 0
      ) {
        const newPhotos =
          result.assets.map(
            (
              asset: ImagePicker.ImagePickerAsset
            ) => asset.uri
          );

        setPhotos((previous) => [
          ...previous,
          ...newPhotos,
        ]);

        setLastDetectedCount(0);
        setValidation(null);
      }
    } catch (error) {
      console.log(
        'GALLERY ERROR:',
        error
      );

      Alert.alert(
        'Gallery Error',
        'Could not open your photos.'
      );
    }
  }

  function removePhoto(
    index: number
  ) {
    Alert.alert(
      'Remove Photo',
      'Remove this Fill Assist photo?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setPhotos((previous) =>
              previous.filter(
                (_, photoIndex) =>
                  photoIndex !== index
              )
            );

            setLastDetectedCount(0);
            setValidation(null);
          },
        },
      ]
    );
  }

  async function analyzePhotos() {
    if (photos.length === 0) {
      Alert.alert(
        'No Photos',
        'Take or select Fill Assist photos first.'
      );

      return;
    }

    try {
      setAnalyzing(true);

      const formData =
        new FormData();

      photos.forEach(
        (
          photoUri,
          index
        ) => {
          const extension =
            photoUri
              .split('.')
              .pop()
              ?.toLowerCase() ||
            'jpg';

          const mimeType =
            extension === 'png'
              ? 'image/png'
              : 'image/jpeg';

          formData.append(
            'photos',
            {
              uri: photoUri,
              name:
                `fill-assist-${index}.${extension}`,
              type: mimeType,
            } as any
          );
        }
      );

      const response =
        await fetch(
          `${backendUrl}/api/analyze-load`,
          {
            method: 'POST',
            body: formData,
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.message ||
            'OCR request failed.'
        );
      }

      if (!data.success) {
        throw new Error(
          data?.message ||
            'Analysis failed.'
        );
      }

      const detected:
        DetectedItem[] =
        Array.isArray(
          data.detected
        )
          ? data.detected
          : [];

      const totals:
        OCRTotals =
        data.totals || {
          cartons: 0,
          totalRequiredMinutes: 0,
          totalRequiredHours: 0,
          totalWasDetected: false,
          aisleMinutes: 0,
          promoMinutes: 0,
          protectMinutes: 0,
          splittingMinutes: 0,
          otherOrganisingMinutes: 0,
        };

      setOcrTotals(
        totals
      );

      /*
       * OCR PREFILLS SPLITTING,
       * BUT MANAGER CAN EDIT IT.
       */

      setSplittingHours(
        String(
          Math.floor(
            totals.splittingMinutes /
              60
          )
        )
      );

      setSplittingMinutesInput(
        String(
          totals.splittingMinutes %
            60
        )
      );

      setValidation(
        data.validation || null
      );

      setItems((previous) =>
        previous.map(
          (existingItem) => {
            const detectedItem =
              detected.find(
                (item) =>
                  item.name ===
                  existingItem.name
              );

            if (!detectedItem) {
              return existingItem;
            }

            return {
              ...existingItem,

              cartons:
                detectedItem.cartons > 0
                  ? String(
                      detectedItem.cartons
                    )
                  : existingItem.cartons,

              hours:
                detectedItem.hours > 0 ||
                detectedItem.minutes > 0
                  ? String(
                      detectedItem.hours
                    )
                  : existingItem.hours,

              minutes:
                detectedItem.hours > 0 ||
                detectedItem.minutes > 0
                  ? String(
                      detectedItem.minutes
                    )
                  : existingItem.minutes,
            };
          }
        )
      );

      setLastDetectedCount(
        detected.length
      );

      Alert.alert(
        'Fill Assist Analyzed',
        `${detected.length} sections detected.\n\nSplitting detected: ${formatMinutes(
          totals.splittingMinutes
        )}\n\nYou can edit splitting before saving.`
      );
    } catch (error: any) {
      console.log(
        'ANALYZE PHOTOS ERROR:',
        error
      );

      Alert.alert(
        'Analysis Failed',
        error?.message ||
          'Could not analyze the photos.'
      );
    } finally {
      setAnalyzing(false);
    }
  }

  function updateItem(
    index: number,
    field:
      | 'cartons'
      | 'hours'
      | 'minutes',
    value: string
  ) {
    setItems((previous) =>
      previous.map(
        (item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                [field]: value,
              }
            : item
      )
    );
  }

  const activeItems =
    items.filter(
      (item) =>
        Number(item.cartons) > 0 ||
        Number(item.hours) > 0 ||
        Number(item.minutes) > 0
    );

  const currentTotalCartons =
    activeItems.reduce(
      (total, item) =>
        total +
        (Number(item.cartons) ||
          0),
      0
    );

  const currentAisleMinutes =
    items
      .filter(
        (item) =>
          item.name.startsWith(
            'Aisle '
          )
      )
      .reduce(
        (total, item) =>
          total +
          (Number(item.hours) ||
            0) *
            60 +
          (Number(item.minutes) ||
            0),
        0
      );

  const promoItem =
    items.find(
      (item) =>
        item.name === 'Promo'
    );

  const currentPromoMinutes =
    promoItem
      ? (Number(
          promoItem.hours
        ) || 0) *
          60 +
        (Number(
          promoItem.minutes
        ) || 0)
      : 0;

  const protectItem =
    items.find(
      (item) =>
        item.name ===
        'Protect - Aisle'
    );

  const currentProtectMinutes =
    protectItem
      ? (Number(
          protectItem.hours
        ) || 0) *
          60 +
        (Number(
          protectItem.minutes
        ) || 0)
      : 0;

  /*
   * MANAGER-EDITED SPLITTING
   */

  const editableSplittingMinutes =
    (Number(
      splittingHours
    ) || 0) *
      60 +
    (Number(
      splittingMinutesInput
    ) || 0);

  /*
   * PRINTED TOTAL FROM FILL ASSIST
   */

  const totalRequiredMinutes =
    ocrTotals
      ?.totalRequiredMinutes ||
    (
      currentAisleMinutes +
      currentPromoMinutes +
      currentProtectMinutes +
      editableSplittingMinutes
    );

  const knownWorkMinutes =
    currentAisleMinutes +
    currentPromoMinutes +
    currentProtectMinutes +
    editableSplittingMinutes;

  const otherOrganisingMinutes =
    Math.max(
      totalRequiredMinutes -
        knownWorkMinutes,
      0
    );

  const workOverTotal =
    knownWorkMinutes >
    totalRequiredMinutes;

  async function saveLoad() {
    const splittingMinuteNumber =
      Number(
        splittingMinutesInput
      ) || 0;

    if (
      splittingMinuteNumber >= 60
    ) {
      Alert.alert(
        'Check Splitting',
        'Splitting minutes must be between 0 and 59.'
      );

      return;
    }

    const invalidAisleMinutes =
      items.some(
        (item) =>
          Number(
            item.minutes
          ) >= 60
      );

    if (
      invalidAisleMinutes
    ) {
      Alert.alert(
        'Check Aisle Time',
        'Minutes must be between 0 and 59.'
      );

      return;
    }

    if (workOverTotal) {
      Alert.alert(
        'Labour Does Not Match',
        'Aisle, Promo, Protect and Splitting time are greater than the Fill Assist total. Please review the values.'
      );

      return;
    }

    try {
      setSaving(true);

      const nightLoad:
        NightLoad = {
        day:
          nightfillDay,

        photos,

        items,

        totalCartons:
          currentTotalCartons,

        totalRequiredMinutes,

        aisleMinutes:
          currentAisleMinutes,

        promoMinutes:
          currentPromoMinutes,

        protectMinutes:
          currentProtectMinutes,

        splittingMinutes:
          editableSplittingMinutes,

        splittingHours,

        splittingMinuteInput:
          splittingMinutesInput,

        otherOrganisingMinutes,

        totalWasDetected:
          ocrTotals
            ?.totalWasDetected ||
          false,

        updatedAt:
          new Date().toISOString(),
      };

      const existing =
        await AsyncStorage.getItem(
          'groceryNightLoads'
        );

      const loads: Record<
        string,
        NightLoad
      > = existing
        ? JSON.parse(existing)
        : {};

      loads[nightfillDay] =
        nightLoad;

      await AsyncStorage.setItem(
        'groceryNightLoads',
        JSON.stringify(loads)
      );

      Alert.alert(
        'Load Saved',
        `Total Required: ${formatMinutes(
          totalRequiredMinutes
        )}\nSplitting: ${formatMinutes(
          editableSplittingMinutes
        )}\nOther / Organising: ${formatMinutes(
          otherOrganisingMinutes
        )}`,
        [
          {
            text: 'OK',
            onPress: () =>
              router.back(),
          },
        ]
      );
    } catch (error) {
      console.log(
        'SAVE LOAD ERROR:',
        error
      );

      Alert.alert(
        'Error',
        'Could not save the load.'
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>
          Loading load...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() =>
            router.back()
          }
        >
          <Text style={styles.back}>
            ‹ Tonight
          </Text>
        </TouchableOpacity>

        <Text style={styles.title}>
          Fill Assist Load
        </Text>

        <Text style={styles.subtitle}>
          {nightfillDay} Nightfill · 5 PM–5 AM
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={
          styles.content
        }
      >
        <View style={styles.sectionHeader}>
          <View>
            <Text
              style={
                styles.sectionTitleNoMargin
              }
            >
              Fill Assist Photos
            </Text>

            <Text style={styles.sectionSubtitle}>
              Include the top summary, splitting and aisle screens
            </Text>
          </View>

          <View style={styles.photoCount}>
            <Text
              style={
                styles.photoCountText
              }
            >
              {photos.length}
            </Text>
          </View>
        </View>

        {photos.length === 0 ? (
          <View style={styles.emptyPhotoCard}>
            <Text style={styles.cameraEmoji}>
              📷
            </Text>

            <Text style={styles.emptyPhotoTitle}>
              Add Fill Assist Photos
            </Text>

            <Text style={styles.emptyPhotoText}>
              Take enough photos to capture the total, splitting and all grocery sections.
            </Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={
              styles.photosRow
            }
          >
            {photos.map(
              (
                photo,
                index
              ) => (
                <View
                  key={`${photo}-${index}`}
                  style={
                    styles.photoWrapper
                  }
                >
                  <Image
                    source={{
                      uri: photo,
                    }}
                    style={styles.photo}
                  />

                  <View style={styles.photoNumber}>
                    <Text
                      style={
                        styles.photoNumberText
                      }
                    >
                      {index + 1}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={
                      styles.removePhoto
                    }
                    onPress={() =>
                      removePhoto(
                        index
                      )
                    }
                  >
                    <Text
                      style={
                        styles.removePhotoText
                      }
                    >
                      ×
                    </Text>
                  </TouchableOpacity>
                </View>
              )
            )}
          </ScrollView>
        )}

        <View style={styles.photoButtons}>
          <TouchableOpacity
            style={
              styles.cameraButton
            }
            onPress={takePhoto}
          >
            <Text
              style={
                styles.cameraButtonText
              }
            >
              📷 Take Photo
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={
              styles.galleryButton
            }
            onPress={choosePhotos}
          >
            <Text
              style={
                styles.galleryButtonText
              }
            >
              Gallery
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.analyzeButton,

            (
              analyzing ||
              photos.length === 0
            ) &&
              styles.disabledButton,
          ]}
          disabled={
            analyzing ||
            photos.length === 0
          }
          onPress={analyzePhotos}
        >
          <Text
            style={
              styles.analyzeButtonText
            }
          >
            {analyzing
              ? 'Analyzing Fill Assist...'
              : '✨ Analyze Fill Assist Automatically'}
          </Text>
        </TouchableOpacity>

        {lastDetectedCount > 0 && (
          <View
            style={
              styles.detectedBanner
            }
          >
            <Text
              style={
                styles.detectedText
              }
            >
              ✓ {lastDetectedCount} sections detected
            </Text>
          </View>
        )}

        {validation
          ?.possibleOCRProblem && (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>
              ⚠ Check OCR Values
            </Text>

            <Text style={styles.warningText}>
              {validation.message}
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>
          Labour Summary
        </Text>

        <View style={styles.masterTotalCard}>
          <View>
            <Text
              style={
                styles.masterTotalLabel
              }
            >
              TOTAL REQUIRED
            </Text>

            <Text
              style={
                styles.masterTotalSubtext
              }
            >
              {ocrTotals
                ?.totalWasDetected
                ? 'Read from Fill Assist'
                : 'Estimated'}
            </Text>
          </View>

          <Text
            style={
              styles.masterTotalValue
            }
          >
            {formatMinutes(
              totalRequiredMinutes
            )}
          </Text>
        </View>

        {/* EDITABLE SPLITTING */}

        <View style={styles.splittingCard}>
          <View style={styles.splittingHeader}>
            <View>
              <Text style={styles.splittingTitle}>
                Splitting
              </Text>

              <Text style={styles.splittingSubtitle}>
                OCR detected this value. Adjust it if required.
              </Text>
            </View>

            <Text style={styles.splittingTotal}>
              {formatMinutes(
                editableSplittingMinutes
              )}
            </Text>
          </View>

          <View style={styles.splittingInputs}>
            <View style={styles.splittingInputBox}>
              <TextInput
                style={styles.splittingInput}
                value={splittingHours}
                onChangeText={
                  setSplittingHours
                }
                keyboardType="number-pad"
                placeholder="0"
              />

              <Text
                style={
                  styles.splittingSuffix
                }
              >
                hours
              </Text>
            </View>

            <View style={styles.splittingInputBox}>
              <TextInput
                style={styles.splittingInput}
                value={
                  splittingMinutesInput
                }
                onChangeText={
                  setSplittingMinutesInput
                }
                keyboardType="number-pad"
                maxLength={2}
                placeholder="0"
              />

              <Text
                style={
                  styles.splittingSuffix
                }
              >
                min
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.bucketGrid}>
          <View style={styles.bucketCard}>
            <Text style={styles.bucketLabel}>
              Aisle Fill
            </Text>

            <Text style={styles.bucketValue}>
              {formatMinutes(
                currentAisleMinutes
              )}
            </Text>
          </View>

          <View style={styles.bucketCard}>
            <Text style={styles.bucketLabel}>
              Splitting
            </Text>

            <Text style={styles.splittingValue}>
              {formatMinutes(
                editableSplittingMinutes
              )}
            </Text>
          </View>

          <View style={styles.bucketCard}>
            <Text style={styles.bucketLabel}>
              Promo
            </Text>

            <Text style={styles.bucketValue}>
              {formatMinutes(
                currentPromoMinutes
              )}
            </Text>
          </View>

          <View style={styles.bucketCard}>
            <Text style={styles.bucketLabel}>
              Protect
            </Text>

            <Text style={styles.bucketValue}>
              {formatMinutes(
                currentProtectMinutes
              )}
            </Text>
          </View>

          <View
            style={[
              styles.bucketCard,
              styles.organisingCard,
            ]}
          >
            <Text style={styles.bucketLabel}>
              Other / Organising
            </Text>

            <Text style={styles.organisingValue}>
              {formatMinutes(
                otherOrganisingMinutes
              )}
            </Text>
          </View>

          <View style={styles.bucketCard}>
            <Text style={styles.bucketLabel}>
              Cartons
            </Text>

            <Text style={styles.bucketValue}>
              {currentTotalCartons}
            </Text>
          </View>
        </View>

        {workOverTotal && (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>
              ⚠ Labour exceeds total
            </Text>

            <Text style={styles.warningText}>
              Your aisle, Promo, Protect and Splitting time add up to more than the Fill Assist total.
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>
          Review Aisles
        </Text>

        <Text style={styles.helperText}>
          Correct any OCR mistakes before saving.
        </Text>

        {items.map(
          (
            item,
            index
          ) => {
            const active =
              Number(item.cartons) > 0 ||
              Number(item.hours) > 0 ||
              Number(item.minutes) > 0;

            return (
              <View
                key={item.name}
                style={[
                  styles.aisleCard,

                  active &&
                    styles.aisleCardActive,
                ]}
              >
                <View style={styles.aisleTop}>
                  <Text style={styles.aisleName}>
                    {item.name}
                  </Text>

                  {active && (
                    <View style={styles.enteredBadge}>
                      <Text style={styles.enteredText}>
                        DETECTED
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.entryRow}>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>
                      Cartons
                    </Text>

                    <TextInput
                      style={styles.cartonInput}
                      value={item.cartons}
                      onChangeText={(value) =>
                        updateItem(
                          index,
                          'cartons',
                          value
                        )
                      }
                      keyboardType="number-pad"
                      placeholder="0"
                    />
                  </View>

                  <View style={styles.timeField}>
                    <Text style={styles.fieldLabel}>
                      Expected
                    </Text>

                    <View style={styles.timeRow}>
                      <View style={styles.timeInputBox}>
                        <TextInput
                          style={styles.timeInput}
                          value={item.hours}
                          onChangeText={(value) =>
                            updateItem(
                              index,
                              'hours',
                              value
                            )
                          }
                          keyboardType="number-pad"
                          placeholder="0"
                        />

                        <Text style={styles.timeSuffix}>
                          h
                        </Text>
                      </View>

                      <View style={styles.timeInputBox}>
                        <TextInput
                          style={styles.timeInput}
                          value={item.minutes}
                          onChangeText={(value) =>
                            updateItem(
                              index,
                              'minutes',
                              value
                            )
                          }
                          keyboardType="number-pad"
                          maxLength={2}
                          placeholder="0"
                        />

                        <Text style={styles.timeSuffix}>
                          m
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            );
          }
        )}

        <TouchableOpacity
          style={[
            styles.saveButton,

            saving &&
              styles.disabledButton,
          ]}
          disabled={saving}
          onPress={saveLoad}
        >
          <Text style={styles.saveText}>
            {saving
              ? 'Saving...'
              : "Save Tonight's Load"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6FA',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F6FA',
  },

  loadingText: {
    color: '#667085',
  },

  header: {
    backgroundColor: '#101D48',
    paddingTop: 65,
    paddingHorizontal: 22,
    paddingBottom: 25,
  },

  back: {
    color: '#D5DBED',
    fontSize: 14,
    marginBottom: 14,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
  },

  subtitle: {
    color: '#D5DBED',
    fontSize: 12,
    marginTop: 5,
  },

  content: {
    padding: 16,
    paddingBottom: 50,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },

  sectionTitleNoMargin: {
    color: '#101828',
    fontSize: 17,
    fontWeight: '800',
  },

  sectionSubtitle: {
    color: '#667085',
    fontSize: 10,
    marginTop: 3,
    maxWidth: 260,
  },

  photoCount: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#E9ECFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  photoCountText: {
    color: '#2436B2',
    fontWeight: '800',
  },

  emptyPhotoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },

  cameraEmoji: {
    fontSize: 34,
  },

  emptyPhotoTitle: {
    color: '#101828',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 8,
  },

  emptyPhotoText: {
    color: '#667085',
    fontSize: 10,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 5,
  },

  photosRow: {
    gap: 10,
  },

  photoWrapper: {
    width: 150,
    height: 210,
    borderRadius: 14,
    overflow: 'hidden',
  },

  photo: {
    width: '100%',
    height: '100%',
  },

  photoNumber: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#101D48',
    borderRadius: 8,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },

  photoNumberText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },

  removePhoto: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FDECEC',
    borderRadius: 8,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  removePhotoText: {
    color: '#D92D20',
    fontSize: 18,
  },

  photoButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },

  cameraButton: {
    flex: 1,
    backgroundColor: '#2436B2',
    paddingVertical: 12,
    borderRadius: 11,
    alignItems: 'center',
  },

  cameraButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },

  galleryButton: {
    width: 100,
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    borderRadius: 11,
    alignItems: 'center',
  },

  galleryButtonText: {
    color: '#2436B2',
    fontSize: 11,
    fontWeight: '800',
  },

  analyzeButton: {
    backgroundColor: '#6D5DFB',
    borderRadius: 13,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 12,
  },

  analyzeButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  disabledButton: {
    opacity: 0.5,
  },

  detectedBanner: {
    backgroundColor: '#E8F8EF',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },

  detectedText: {
    color: '#168455',
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
  },

  warningCard: {
    backgroundColor: '#FFF4E5',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },

  warningTitle: {
    color: '#B54708',
    fontSize: 11,
    fontWeight: '800',
  },

  warningText: {
    color: '#7A2E0E',
    fontSize: 9,
    lineHeight: 14,
    marginTop: 3,
  },

  sectionTitle: {
    color: '#101828',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 20,
    marginBottom: 8,
  },

  masterTotalCard: {
    backgroundColor: '#101D48',
    borderRadius: 16,
    padding: 17,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  masterTotalLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  masterTotalSubtext: {
    color: '#AEB9DD',
    fontSize: 8,
    marginTop: 3,
  },

  masterTotalValue: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
  },

  splittingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 15,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#D7DDFE',
  },

  splittingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  splittingTitle: {
    color: '#101828',
    fontSize: 16,
    fontWeight: '800',
  },

  splittingSubtitle: {
    color: '#667085',
    fontSize: 9,
    marginTop: 3,
    maxWidth: 230,
  },

  splittingTotal: {
    color: '#6D5DFB',
    fontSize: 19,
    fontWeight: '800',
  },

  splittingInputs: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },

  splittingInputBox: {
    flex: 1,
    backgroundColor: '#F2F4F7',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },

  splittingInput: {
    flex: 1,
    paddingVertical: 11,
    textAlign: 'center',
    color: '#101D48',
    fontWeight: '800',
  },

  splittingSuffix: {
    color: '#667085',
    fontSize: 9,
  },

  bucketGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },

  bucketCard: {
    width: '48.5%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
  },

  organisingCard: {
    borderWidth: 1,
    borderColor: '#D7DDFE',
  },

  bucketLabel: {
    color: '#667085',
    fontSize: 9,
  },

  bucketValue: {
    color: '#101D48',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 5,
  },

  splittingValue: {
    color: '#6D5DFB',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 5,
  },

  organisingValue: {
    color: '#2436B2',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 5,
  },

  helperText: {
    color: '#667085',
    fontSize: 10,
    lineHeight: 16,
    marginBottom: 10,
  },

  aisleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 13,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },

  aisleCardActive: {
    borderColor: '#C7D0FF',
  },

  aisleTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  aisleName: {
    color: '#101828',
    fontSize: 14,
    fontWeight: '800',
  },

  enteredBadge: {
    backgroundColor: '#E8F8EF',
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },

  enteredText: {
    color: '#168455',
    fontSize: 7,
    fontWeight: '800',
  },

  entryRow: {
    flexDirection: 'row',
    gap: 10,
  },

  field: {
    flex: 1,
  },

  timeField: {
    flex: 1.5,
  },

  fieldLabel: {
    color: '#98A2B3',
    fontSize: 9,
    marginBottom: 5,
  },

  cartonInput: {
    backgroundColor: '#F2F4F7',
    borderRadius: 9,
    paddingVertical: 10,
    textAlign: 'center',
    fontWeight: '800',
  },

  timeRow: {
    flexDirection: 'row',
    gap: 6,
  },

  timeInputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F4F7',
    borderRadius: 9,
    paddingHorizontal: 7,
  },

  timeInput: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: 10,
    fontWeight: '800',
  },

  timeSuffix: {
    color: '#667085',
    fontSize: 9,
  },

  saveButton: {
    backgroundColor: '#2436B2',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },

  saveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});