# DUII — Digital Usage Intensity Index

> **An original data science metric that quantifies smartphone behavioral intensity as a single score between 0 and 1.**

Developed by **M Sarvesh** · Data Science Research, 2026

---

## What is DUII?

Most screen time tools tell you *how long* you used your phone. DUII tells you *how intensely* — by measuring both your behavioral dependency and how much your usage is disrupting your daily routine.

DUII combines two original sub-indices derived from correlation analysis on four real-world datasets:

| Index | What it measures |
|-------|-----------------|
| **BDI** (Behavioral Dependency Index) | How addicted your usage patterns look |
| **RDI** (Routine Disruption Index) | How much your phone is disrupting sleep & routine |

---

## The Formula

```
DUII = 0.43 × BDI + 0.57 × RDI
```

```
BDI = 0.70 × U + 0.29 × C + 0.01 × B
RDI = 0.52 × U + 0.48 × (1 − S_normalized)
```

Where:
- **U** = normalized daily usage → `(x − 0) / (11.5 − 0)`
- **C** = normalized phone checks → `(x − 20) / (150 − 20)`
- **B** = normalized screen before bed → `(x − 0) / (2.6 − 0)`
- **S** = normalized sleep hours → `(x − 3.8) / (9.6 − 3.8)`

> Every weight (0.43, 0.57, 0.70, 0.29, 0.52, 0.48) was derived through correlation analysis — not assumed.

---

## Score Ranges

| Score | Category | Meaning |
|-------|----------|---------|
| 0.00 – 0.30 | 🟢 Low | Healthy digital habits |
| 0.30 – 0.60 | 🟡 Moderate | High but controlled |
| 0.60 – 0.80 | 🟠 High | Risk of dependency |
| 0.80 – 1.00 | 🔴 Severe | Strong digital intensity |

---

## The App

A full Android app built in React Native around the DUII formula.

### Features

- 📱 **Auto Fetch** — reads real screen time from Android's UsageStats API
- ✏️ **Manual Input** — sliders for all 4 variables with live score calculation
- 📊 **History Tracking** — saves every entry locally on device with charts
- 🔮 **Insights Tab** — trend detection, 7-day projection, early burnout alerts
- 🌙 **Dark & Light mode**
- 🔒 **100% local** — no data sent to any server

### Insights Engine

The Insights tab runs statistical analysis on your saved history:

- **Linear regression** to detect if your score is trending up or down
- **3-day moving average** to smooth daily noise and surface the real trend
- **7-day linear projection** to show where your score is heading
- **Smart alerts** that fire when trend exceeds thresholds (e.g. rising >1%/day, 3+ consecutive days in High zone)
- **Variable impact ranking** — tells you which of the 4 inputs is hurting your score most

---

## Research Methodology

| Step | What was done |
|------|--------------|
| Data Collection | 4 real-world datasets from Kaggle covering smartphone usage, app engagement, behavioral addiction, sleep patterns |
| Cleaning | Removed nulls and duplicates across all datasets |
| Feature Selection | Split columns into Core (used for DUII) and Validation (used only for verification) |
| EDA | Distribution plots, correlation heatmaps, outlier detection, usage vs addiction scatter plots |
| Feature Engineering | Derived social_media_ratio, usage_ratio, sleep deficit columns |
| Normalization | Min-Max scaling to keep all variables in [0, 1] range |
| BDI Construction | Weights derived from correlation with addiction-related outcomes |
| RDI Construction | Weights derived from correlation with sleep and academic disruption |
| Validation | Both indices validated against held-back validation columns |
| DUII Construction | α=0.43, β=0.57 found through optimization of predictive importance |

---

## Tech Stack

### Research
![Python](https://img.shields.io/badge/Python-3776AB?style=flat&logo=python&logoColor=white)
![Jupyter](https://img.shields.io/badge/Jupyter-F37626?style=flat&logo=jupyter&logoColor=white)
![NumPy](https://img.shields.io/badge/NumPy-013243?style=flat&logo=numpy&logoColor=white)
![Pandas](https://img.shields.io/badge/Pandas-150458?style=flat&logo=pandas&logoColor=white)
![Scikit-learn](https://img.shields.io/badge/Scikit--learn-F7931E?style=flat&logo=scikit-learn&logoColor=white)
![Seaborn](https://img.shields.io/badge/Seaborn-4C72B0?style=flat&logo=python&logoColor=white)

### App
![React Native](https://img.shields.io/badge/React_Native-20232A?style=flat&logo=react&logoColor=61DAFB)
![Android](https://img.shields.io/badge/Android-3DDC84?style=flat&logo=android&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)

---

## Run Locally

### Prerequisites
- Node.js v18+
- Java JDK 17
- Android Studio + Android SDK
- Android device or emulator (API 28+)

### Setup

```bash
# Clone the repo
git clone https://github.com/yourusername/duii-app.git
cd duii-app

# Install dependencies
npm install

# Start Metro bundler
npx react-native start

# Run on Android (in a second terminal)
npx react-native run-android
```

### Permissions

On first launch, the app will ask for **Usage Access** permission to read real screen time data. Go to Settings → Usage Access → enable DUIIApp.

---

## Project Structure

```
duii-app/
├── App.tsx                          # Main app — all screens and logic
├── android/
│   └── app/src/main/java/com/duiiapp/
│       ├── UsageStatsModule.java    # Native Android module for real data
│       ├── UsageStatsPackage.java   # Package registration
│       └── MainApplication.kt      # App entry point
├── research/
│   └── DIGITAL_USAGE_INTENSITY_INDEX.docx  # Full research document
└── README.md
```

---

## Future Scope

- [ ] Google Fit integration for real sleep hours
- [ ] Push notifications for daily DUII score
- [ ] Phase 2 — ARIMA/LSTM model via Python backend for true ML forecasting
- [ ] CSV export for research data collection
- [ ] Multi-user comparison (anonymized)
- [ ] Potential OS-level integration (Android Digital Wellbeing / Apple Screen Time)

---

## Author

**M Sarvesh**
Data Science Research Study, 2026

---

## License

This project and the DUII formula are original research work by M Sarvesh.
Feel free to reference with attribution.
