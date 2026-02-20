<!--
SYNC IMPACT REPORT
==================
Version change:    0.2.0 → 1.0.0
Bump rationale:    MAJOR — Principle II (Swift-First) backward-incompatibly replaced by
                   TypeScript-First; entire technology stack replaced (Swift/SwiftUI/SPM/XCTest
                   → TypeScript/React Native/npm/Jest+Detox); performance metrics rewritten
                   for the JS runtime model.

Modified principles:
  I.  iOS-Native Design (HIG Compliance) → Platform-Adaptive Design
      — SwiftUI/UIKit references replaced with React Native core components and
        platform-conditional styling. HIG compliance retained for iOS surfaces.
  II. Swift-First, Dependencies by Exception → TypeScript-First, Lean Dependency Graph
      — Complete replacement: Swift 6/SPM/actors → TypeScript strict/npm/async-await.
  III. API-Driven Intelligence
      — URLSession → fetch(); iOS Keychain via react-native-keychain (not Security
        framework directly); streaming via ReadableStream/fetch.
  IV. Privacy & App Store Compliance
      — PrivacyInfo.xcprivacy and ATT requirements retained (still ship to iOS App Store);
        AsyncStorage explicitly prohibited for secrets.
  V.  Test-Driven Development
      — XCTest/Swift Testing/XCUITest → Jest + React Native Testing Library + Detox.
  VI. Performance Standards
      — Native-thread metrics replaced with JS-thread and bridge/JSI metrics; Hermes
        engine mandated; Metro bundle size gate added.

Added sections:
  (none)

Removed sections:
  (none)

Templates reviewed & status:
  ✅ .specify/templates/plan-template.md   — Constitution Check gate still valid; Technical
                                            Context fields now expect TypeScript/RN values.
                                            No structural edit required.
  ✅ .specify/templates/spec-template.md  — No constitution-specific refs; no edit required.
  ✅ .specify/templates/tasks-template.md — Phase structure unchanged; path conventions
                                            should use src/ layout from RN project. No edit
                                            required (plan.md governs concrete paths).
  ✅ .specify/templates/agent-file-template.md — Generic; no edit required.
  ✅ .specify/templates/checklist-template.md  — Generic; no edit required.

Deferred TODOs:
  - TODO(RATIFICATION_DATE): Set when the team formally adopts this constitution.
  - TODO(EXPO_VS_BARE): Confirm whether to use Expo managed workflow or bare React Native.
    Update Technology Stack and Development Workflow once decided.
-->

# Claude on Mobile Constitution

## Core Principles

### I. Platform-Adaptive Design

All UI MUST be built with React Native core components. Third-party component libraries
are subject to the dependency justification gate in Principle II.

- The app MUST follow the iOS Human Interface Guidelines (HIG) on iOS surfaces and
  Material Design guidelines on Android surfaces. Use `Platform.OS` to apply
  platform-conditional styles where the guidelines diverge.
- Touch targets MUST be ≥ 44×44 pt (iOS) / 48×48 dp (Android). No exceptions.
- ALL text MUST use dynamic/scalable font sizes; hardcoded pixel font sizes are prohibited.
  On iOS, respect Dynamic Type by deriving sizes from the system font scale.
- The app MUST support both light and dark mode. Colors MUST be sourced from a semantic
  design token system (e.g., `useColorScheme`-driven theme); hardcoded hex or RGB values
  in component styles are prohibited.
- Layouts MUST handle safe area insets on all supported devices (notch, Dynamic Island,
  home indicator) using `react-native-safe-area-context`.
- Animations MUST respect the `reduceMotion` accessibility setting
  (`AccessibilityInfo.isReduceMotionEnabled`). Motion-heavy transitions MUST have a
  static or reduced alternative.
- ALL non-decorative UI elements MUST carry `accessibilityLabel` (and `accessibilityRole`
  where applicable). The app MUST be fully navigable via VoiceOver (iOS) and TalkBack
  (Android) before any feature ships.

**Rationale**: React Native renders to native views. Users expect platform-native behavior;
failing HIG or Material standards triggers App Store/Play Store rejection and user churn.

### II. TypeScript-First, Lean Dependency Graph

TypeScript is the sole permitted language for all application source code.

- All source files MUST use `.ts` or `.tsx` extensions. JavaScript (`.js`/`.jsx`) files
  are prohibited in `src/`; configuration files (babel, metro, jest configs) may remain
  in JS.
- TypeScript MUST be configured with `"strict": true`; the `any` type is prohibited
  except at external API boundary types, which MUST be narrowed before use.
- `async`/`await` MUST be used for all asynchronous code. Raw `Promise` chains and
  callback-based patterns are permitted only when wrapping a library that provides no
  Promise interface.
- Every new `npm` dependency MUST be justified in the plan's Complexity Tracking table
  with: the problem it solves, alternatives evaluated, and the measured impact on Metro
  bundle size. Dependencies that require native module linking carry additional scrutiny.
- TODO(EXPO_VS_BARE): Until resolved, prefer packages compatible with both workflows.
  Native module additions that would require ejecting from a managed workflow MUST be
  escalated to a team decision.

**Rationale**: TypeScript strict mode catches entire classes of runtime errors at compile
time. A lean dependency graph reduces bundle size, attack surface, and upgrade friction.

### III. API-Driven Intelligence

All AI capabilities MUST be accessed exclusively via the Claude API. No on-device model
inference, embedded weights, or third-party AI SDKs are permitted.

- All HTTP calls to the Claude API MUST use the native `fetch()` API with `async`/`await`.
  No third-party HTTP client libraries for this purpose.
- Streaming API responses (server-sent events) MUST be consumed incrementally using
  `ReadableStream`; buffering a full response before rendering is prohibited for any
  response that may exceed 200 tokens.
- The app MUST handle and surface the following error states with user-visible recovery UI:
  rate limiting (429), request timeout, network unreachable, and server error (5xx).
- API keys and auth tokens MUST be stored exclusively in the device's secure storage via
  `react-native-keychain`. Storage in `AsyncStorage`, `mmkv` (unencrypted), `.env` files
  bundled into the app, or source code is prohibited. Keys MUST never appear in logs,
  crash reports, or error messages.

**Rationale**: Centralizing intelligence through the API keeps the client lean and enables
transparent model upgrades without an app release.

### IV. Privacy & App Store Compliance

User data MUST be handled with minimum footprint and full transparency.

- Conversation content MUST NOT be persisted to device storage or any backend beyond the
  active session without an explicit, affirmative user opt-in action.
- The iOS `PrivacyInfo.xcprivacy` manifest MUST declare every privacy-sensitive API
  category accessed (`NSPrivacyAccessedAPITypes`). Missing or inaccurate declarations
  cause App Store rejection.
- The App Store (and Google Play) privacy disclosures MUST accurately reflect all data
  collected. They MUST be reviewed and updated as part of every feature that introduces
  a new data collection point.
- Device advertising tracking requires an ATT prompt
  (`react-native-tracking-transparency`); fingerprinting or cross-app tracking without
  consent is prohibited.
- App Store and Google Play Review Guidelines MUST be checked during feature design, not
  after implementation. Features requiring guideline exceptions MUST be discussed before
  spec sign-off.

**Rationale**: Mobile platform stores enforce privacy rules at submission time. Discovering
violations post-implementation is expensive; preventing them is cheap.

### V. Test-Driven Development (NON-NEGOTIABLE)

Tests MUST be written and confirmed failing before implementation begins.

- The Red-Green-Refactor cycle is mandatory without exception: write a failing test →
  implement the minimum code to pass → refactor.
- **Unit and integration tests**: Jest + React Native Testing Library (`@testing-library/
  react-native`). Snapshot tests are prohibited as a substitute for behavioral assertions.
- **End-to-end tests**: Detox. Every P1 user story MUST have at least one Detox test
  covering the primary happy path. E2E tests MUST run on a simulator/emulator in CI.
- TypeScript strict mode serves as a static first layer; it does not substitute for
  runtime tests.
- Code coverage MUST NOT decrease on any PR. CI enforces a non-regression gate via Jest's
  `--coverage` flag; PRs that reduce coverage without explicit justification MUST be
  rejected.
- Tests MUST pass in CI before any PR may be merged. Flaky tests MUST be quarantined and
  tracked; they do not excuse bypassing the gate.

**Rationale**: React Native's JS/native bridge and async rendering make regressions
subtle. A mandatory failing-first discipline surfaces integration issues early.

### VI. Performance Standards

The app MUST be fast and resource-efficient on all supported devices.

- **Launch time**: time-to-interactive on a 3-year-old mid-range device MUST be
  < 2 s (cold start). Measure with Flipper or platform profilers, not simulator only.
- **JS thread**: the JavaScript thread MUST never be blocked by synchronous computation
  exceeding 16 ms. Heavy computation MUST be offloaded via `InteractionManager.
  runAfterInteractions`, a `Worker`, or a native module.
- **Frame rate**: scrolling lists and transitions MUST sustain 60 fps. React DevTools
  Profiler and `react-native-performance` traces MUST show no dropped-frame patterns
  before any feature ships. Avoid unnecessary re-renders; `React.memo`, `useCallback`,
  and `useMemo` MUST be used deliberately and not speculatively.
- **Bundle size**: Metro bundle analysis (`react-native-bundle-visualizer` or equivalent)
  MUST be run on any PR that adds a dependency. Total JS bundle MUST stay below 3 MB
  (gzipped). Tree-shaking MUST be verified for large libraries.
- **Memory**: the app MUST not hold unbounded in-memory state. Lists of dynamic length
  MUST use `FlatList` or `FlashList` (virtualized); `ScrollView` for long content lists
  is prohibited.
- **Hermes**: the Hermes JavaScript engine MUST be enabled on both iOS and Android. No
  configuration may disable it.

**Rationale**: React Native apps can easily underperform native due to bridge overhead and
uncontrolled re-renders. Explicit, measurable gates are the only reliable safeguard.

## Technology Stack

- **Platform**: iOS 17+ and Android 10+ via React Native
- **Language**: TypeScript 5.x (`"strict": true`)
- **UI Framework**: React Native (core components); React Navigation for routing
- **Async model**: `async`/`await` (native Promises); no RxJS or Observable patterns
- **Dependency Management**: npm (or bun); CocoaPods for iOS native modules
- **Networking**: `fetch()` (built-in)
- **Secrets Storage**: `react-native-keychain`
- **Safe Area**: `react-native-safe-area-context`
- **Testing**: Jest + React Native Testing Library (unit/integration); Detox (E2E)
- **Linting**: ESLint (`@typescript-eslint`) + Prettier (enforced in CI, zero warnings)
- **JS Engine**: Hermes (required on iOS and Android)
- **CI/CD**: GitHub Actions; TODO(EXPO_VS_BARE): EAS Build (Expo) or Fastlane (bare)
- **AI API**: Claude API — latest stable model at time of implementation

## Development Workflow

- All work MUST be done on a feature branch; direct commits to `main` are prohibited.
- PRs MUST include: a link to the relevant `spec.md`, an explicit Constitution Check
  attestation, and a lint-clean, type-check-clean build (`tsc --noEmit`).
- At least one peer review approval is REQUIRED before merge.
- CI MUST pass all gates before merge: ESLint (zero warnings), `tsc --noEmit`,
  Jest suite with coverage non-regression, Detox E2E suite.
- Internal beta distribution MUST use TestFlight (iOS) and the Play Store internal track
  (Android). Ad-hoc or sideloaded builds are prohibited for external testers.
- App Store and Play Store submissions require QA sign-off on the beta build and
  confirmation that privacy disclosures and `PrivacyInfo.xcprivacy` are current.
- Breaking changes to shared module interfaces MUST be versioned (semver) and communicated
  before merging to `main`.

## Governance

This constitution supersedes all prior informal project practices. Where any plan, spec,
or task conflicts with a principle stated here, the constitution takes precedence and the
conflicting artifact MUST be updated.

**Amendment procedure**:
1. Propose the change in a PR modifying this file.
2. Document the rationale and version bump type (MAJOR / MINOR / PATCH) in the PR
   description.
3. Obtain at least one explicit approval from a project maintainer.
4. Update `LAST_AMENDED_DATE` and `CONSTITUTION_VERSION` before merging.
5. Run `/speckit.constitution` after merge to propagate changes to dependent templates.

**Versioning policy**:
- MAJOR: Removal or backward-incompatible redefinition of an existing principle.
- MINOR: New principle or section added, or material expansion of existing guidance.
- PATCH: Clarifications, wording fixes, typo corrections, non-semantic refinements.

**Compliance review**: Every PR author MUST self-certify compliance with all principles
before requesting review. Reviewers MUST reject PRs that visibly violate a principle
without a documented justification in the Complexity Tracking table of the relevant plan.

**Version**: 1.0.0 | **Ratified**: TODO(RATIFICATION_DATE) | **Last Amended**: 2026-02-20
