import {
  initializeHEY,
  processInput,
  rememberUserInformation,
  getHEYState,
  createAgentTask,
  getSystemStatus,
} from "./heyBrain.js";

import heyPersonality from "./personality.js";

import {
  getContext,
  updateUserContext,
  addMemory,
  addImportantFact,
  setActiveAgent,
  setActiveMode,
} from "./contextManager.js";

import {
  storeMemory,
  searchMemory,
  buildMemorySummary,
} from "./memoryEngine.js";

import {
  routeToAgent,
  getAvailableAgents,
  getAgentRecommendation,
} from "./agentRouter.js";

import {
  createPlan,
  getNextStep,
} from "./planner.js";

import {
  executeTask,
  getRunningTask,
  getAllRunningTasks,
  stopTask,
} from "./executionEngine.js";

import {
  registerTool,
  unregisterTool,
  getTool,
  listTools,
  listToolCatalog,
  searchToolCatalog,
  runToolLibraryEntry,
  startToolLibraryEntry,
  stopToolLibraryEntry,
  getToolLifecycleContract,
  toolLibraryPreferenceStore,
  executeTool,
} from "./toolRegistry.js";

import {
  subscribe,
  publish,
  publishOnce,
  replayPending,
  clearEventListeners,
} from "./eventBus.js";
import { EventOutboxStoreContract, InMemoryEventOutboxStore } from "./eventOutbox.js";
import { SupabaseEventOutboxStore } from "./supabaseEventOutboxStore.js";
import { SupabaseMissionCheckpointStore } from "./supabaseMissionCheckpointStore.js";
import { SupabaseDeviceCommandQueueStore } from "./supabaseDeviceCommandQueueStore.js";

import {
  recordAudit,
  listAuditEntries,
  clearAuditEntries,
} from "./auditLog.js";

import {
  grantPermission,
  revokePermission,
  hasPermission,
  listPermissions,
  requestPermission,
  executeWithPermission,
} from "./permissionManager.js";

import { evaluateResponse, buildQualityInstruction } from "./qualityEngine.js";
import { processInputFusion, createTextInput, createVoiceInput, createImageInput, createScreenInput, createGestureInput, createFileInput, createSelectionInput, createEventInput, MODALITIES, INPUT_STAGES } from "./inputFusion.js";
import { createAction, listActions, getAction, approveAction, executeAction, undoAction } from "./actionEngine.js";
import { issueActionMandate, verifyAndConsumeMandate, InMemoryMandateStore, MandateStoreContract } from "./actionMandate.js";
import { SupabaseMandateStore } from "./supabaseMandateStore.js";
import { createEvidenceEnvelope, verifyEvidenceEnvelope, invalidateEvidence, InMemoryEvidenceStore, EvidenceStoreContract, EVIDENCE_ENVELOPE_FORMAT, EVIDENCE_STORE_CONTRACT_VERSION } from "./evidenceIntegrity.js";
import { SupabaseEvidenceStore } from "./supabaseEvidenceStore.js";
import { createReleaseInventoryAttestationBody, evaluateReleaseGate } from "./releaseGate.js";
import { planIntegrationMigration, INTEGRATION_MIGRATION_DISPOSITIONS } from "./integrationMigrationPlanner.js";
import { createMission, getMission, getAllMissions, getActiveMissions, getMissionsByState, getMissionsByProject, updateMission, setMissionState, startMission, pauseMission, resumeMission, cancelMission, retryMission, updateMissionStep, createMissionCheckpoint, restoreMissionCheckpoint, getMissionProgress, getMissionReplay, deleteMission, subscribeToMissions, MISSION_STATES, STEP_STATES } from "./missionCenter.js";
import { parseNaturalCommand } from "./commandParser.js";
import { understandVoiceCommand } from "./voiceCommandUnderstanding.js";
import { createDictationEditSession } from "../lib/dictationEditProposals.js";
import { onboardingEngine, tutorialEngine, startOnboarding, getOnboardingProgress, completeOnboardingStage, skipOnboardingStage, setOnboardingLocale, setOnboardingAccessibility, setOnboardingStarterSpaces, getOnboardingStarterSpaces, selectPracticeTask, completePracticeTask, getPracticeTasks, getOnboardingSteps, dismissOnboardingSuggestion, isOnboardingSuggestionDismissed, resetOnboarding, subscribeToOnboarding, registerTutorial, getTutorial, getTutorialProgress, startTutorial, completeTutorialStep, skipTutorial, completeTutorial, resetTutorial, ONBOARDING_STAGES, ONBOARDING_STEPS, PRACTICE_TASKS } from "./onboardingEngine.js";
import { defaultTutorials } from "./tutorialCatalog.js";
import { workspaceEngine, createWidget, getWidget, getAllWidgets, getWidgetsByFamily, getActiveWidgets, updateWidget, setWidgetState, moveWidget, resizeWidget, bringWidgetToFront, sendWidgetToBack, pinWidget, groupWidgets, ungroupWidgets, dockWidget, undockWidget, closeWidget, deleteWidget, handleSemanticDrop, saveLayout, loadLayout, getLayouts, deleteLayout, handleMonitorChange, subscribeToWorkspace, WIDGET_STATES, WIDGET_FAMILIES, DRAG_TYPES, SNAP_MODES } from "./workspaceEngine.js";
import { spaceCreationEngine, previewNaturalLanguageSpaceCreation, confirmNaturalLanguageSpaceCreation, getPrivateSpaces, getSpaceLayoutPreferences, updateSpaceLayoutPreferences, setSpaceToolMembership, subscribeToPrivateSpaces, SPACE_CREATION_CONTRACT_VERSION, SPACE_STORAGE_CONTRACT_VERSION, SPACE_LAYOUT_PREFERENCES_CONTRACT_VERSION, SPACE_CREATION_LIMITS } from "./spaceCreationEngine.js";
import { createProjectDNA, getProjectDNA, updateProjectDNA, deleteProjectDNA, listProjectDNAs, checkProjectConsistency, exportProjectDNA, importProjectDNA, setProjectLock, getProjectLocks, removeProjectLock, DNA_FIELDS, DRIFT_TYPES, RULE_PRECEDENCE, LOCK_TYPES as DNA_LOCK_TYPES } from "./projectDNA.js";
import {
  createPinpointContract,
  verifyPinpointChange,
  applyLock,
  removeLock,
  getLocks,
  saveLockPreset,
  getLockPreset,
  copyLocks,
  inspectChanges,
  createVersion as createPinpointVersion,
  getVersion as getPinpointVersion,
  createBranch,
  getBranch,
  addVersionToBranch,
  mergeVersions as mergePinpointVersions,
  cherryPickChange as cherryPickPinpointChange,
  compareVersions as comparePinpointVersions,
  restoreVersion as restorePinpointVersion,
  markApproved as markPinpointApproved,
  markFinal as markPinpointFinal,
  archiveVersion,
  deleteVersion,
  listVersions,
  getVersionHistory as getPinpointVersionHistory,
  getBranches as getPinpointBranches,
  getVersionGraph as getPinpointVersionGraph,
  LOCK_TYPES,
  INVARIANT_CLASSES,
  CHANGE_STATUS,
  REPAIR_ACTIONS,
} from "./pinpointPrecision.js";
import {
  ingestMemory,
  retrieveMemories,
  updateMemory,
  supersedeMemory,
  deleteMemory,
  connectMemories,
  getMemoryGraph as getCosmosGraph,
  getContradictions,
  getCandidates,
  getCandidate,
  approveCandidate,
  rejectCandidate,
  getTombstones,
  hasTombstone,
  subscribeToCosmos,
  MEMORY_TYPES,
  PRIVACY_SCOPES,
  INGESTION_SOURCES,
} from "./cosmosMemory.js";
import { chatTransportEngine, createConversation, getConversation, getAllConversations, getConversationsByProject, updateConversation, deleteConversation, archiveConversation, unarchiveConversation, createMessage, saveDraft, getDraft, clearDraft, sendMessage, streamMessage, branchConversation, addAttachment, uploadAttachment, exportConversation, importConversation, subscribeToChat, CONVERSATION_STATES, MESSAGE_STATES, ATTACHMENT_STATES } from "./chatTransport.js";
import { createLiveSession, startLiveSession, addLiveSource, switchLiveSource, removeLiveSource, processLiveInput, executeLiveAction, setLiveMode, updateLiveOverlay, addLiveHighlight, removeLiveHighlight, addLiveLabel, addLiveArrow, addLiveStepMarker, dimLiveArea, pauseLiveSession, resumeLiveSession, stopLiveSession, getLiveSession, getActiveLiveSession, listLiveSessions, grantLivePermission, revokeLivePermission, getLiveSessionMetrics, reconnectLiveSession, LIVE_STATES, LIVE_MODES, SOURCE_TYPES } from "./heyLive.js";
import { createDynamicIsland, getDynamicIsland, getDefaultDynamicIsland, listDynamicIslands, updateDynamicIslandSettings, addIslandActivity, updateIslandActivity, removeIslandActivity, dismissIslandActivity, pinIslandActivity, unpinIslandActivity, setIslandState, toggleIslandExpanded, handleIslandInteraction, addIslandModule, removeIslandModule, updateIslandModule, enableIslandModule, disableIslandModule, getVisibleIslandActivities, cleanupExpiredIslandActivities, completeIslandActivity, errorIslandActivity, destroyDynamicIsland, ISLAND_STATES, ACTIVITY_TYPES } from "./dynamicIsland.js";
import { startBackgroundHelper, stopBackgroundHelper, pauseBackgroundHelper, resumeBackgroundHelper, getBackgroundHelperState, isBackgroundCapabilityEnabled, enableBackgroundCapability, disableBackgroundCapability, runBackgroundTask, cancelBackgroundTask, handleBackgroundCloseBehavior, HELPER_STATES, BACKGROUND_CAPABILITIES } from "./backgroundHelper.js";
import { validateForgeArtifact, createForgePreview } from "./forgeEngine.js";
import {
  buildTeacherLessonArtifact,
  verifyTeacherLessonArtifact,
  saveTeacherLessonArtifact,
  exportTeacherLessonMarkdown,
  buildTeacherAssessmentArtifact,
  verifyTeacherAssessmentArtifact,
  saveTeacherAssessmentArtifact,
  exportTeacherAssessmentMarkdown,
} from "./teacherExperience.js";
import { createProactiveSuggestion, evaluateProactiveSignals, explainSuggestion } from "./proactiveEngine.js";

import { getDeviceId, getDeviceName, renameDevice, startFabric, listPeers, requestHandoff, getHandoffBundle, clearHandoffBundle, acceptHandoff, producePairCode, registerPairCode, getPairCode } from "./deviceFabric.js";
import { registerDeviceAdapter, unregisterDeviceAdapter, registerDevice, unregisterDevice, revokeDevice, listDevices, getDevice, getDeviceCapabilities, listDeviceAdapters, executeOnDevice } from "./deviceGateway.js";

import {
  createArtifact,
  getArtifact,
  updateArtifact,
  createVersion,
  branchArtifact,
  mergeVersions,
  cherryPickChange,
  getVersion,
  getVersionHistory,
  getBranches,
  compareVersions,
  restoreVersion,
  markApproved,
  markFinal,
  archiveArtifact,
  deleteArtifact,
  listArtifacts,
  getVersionGraph,
  ARTIFACT_TYPES as ARTIFACT_KINDS,
  ARTIFACT_STATUS,
} from "./artifactEngine.js";
import {
  registerGenerationProvider,
  unregisterGenerationProvider,
  getGenerationProvider,
  listGenerationProviders,
  setGenerationRoutingRule,
  getGenerationRoutingRule,
  setDefaultGenerationStrategy,
  generateImage,
  generateVideo,
  generateAudio,
  generateFrame,
  generateSpeech,
  getGenerationJob,
  getActiveGenerationJobs,
  getGenerationHistory,
  cancelGenerationJob,
  retryGenerationJob,
  getGenerationProviderStats,
  GENERATION_TYPES,
  PROVIDER_CATEGORIES,
  ROUTING_STRATEGIES,
} from "./generationEngine.js";
import {
  isAutoApproveEnabled as memoryAutoApprove,
  setAutoApproveEnabled as setMemoryAutoApprove,
  queueMemory,
  listInbox,
  countPending,
  approveMemory,
  rejectMemory,
  clearInbox,
} from "./memoryInbox.js";

import { registerComputerTools, setComputerAdapter } from "./computerTools.js";
import { registerCapability, getCapability, listCapabilities, getCapabilityAvailability, executeCapability } from "./capabilityRegistry.js";
import { getMode, listModes, registerMode } from "./modeRegistry.js";
import { executeRequest, getToolForCommand } from "./executionController.js";
import { runVerifiedStep, runVerifiedWorkflow } from "./executionLoop.js";
import { VOICE_STATES, createVoiceState } from "./voiceState.js";
import { validateImageInput, understandImage, inspectScreen } from "./visionEngine.js";
import { createTask, updateTask, getTask, listTasks, removeTask } from "./taskEngine.js";
import { getMemoryNeighborhood, upsertMemoryNode, searchMemoryGraph, clearMemoryGraph } from "./memoryGraph.js";
import { createWorkflow, runWorkflow } from "./workflowEngine.js";
import { createSkill, listSkills, getSkill, updateSkill, runSkill } from "./skillEngine.js";
import { createMorningBriefing } from "./briefingEngine.js";
import { registerProvider, attachEvaluationReport, unregisterProvider, getProvider, listProviders, listModels, clearProviders } from "./providerRegistry.js";
import { selectModel, createProviderPlan } from "./providerRouter.js";
import { FUSION_MODES, runProviderFusion } from "./providerFusion.js";
import { createModelRecord, createAdapterManifest, createAdapterServingTarget, createInferenceRequest, createEvaluationReport, verifyEvaluationReport, INFERENCE_PROFILES, OPEN_MODEL_CANDIDATES } from "./modelPlatform.js";
import { 
  initializeComputerControl, 
  executeComputerControl, 
  setControlMode, 
  getControlMode, 
  getComputerCapabilities, 
  getCommandHistory, 
  clearCommandHistory, 
  connectPhone, 
  disconnectPhone, 
  getPhoneConnection, 
  isPhoneConnected, 
  executePhoneCapability, 
  executeBrowserCapability, 
  executeComputerCapability, 
  getAvailableAdapters, 
  CONTROL_MODES, 
  COMPUTER_CAPABILITIES, 
  PHONE_CAPABILITIES, 
  BROWSER_CAPABILITIES,
  computerControlEngine,
  subscribeToComputerControl 
} from "./computerControl.js";
import { 
  addFileRoot, 
  removeFileRoot, 
  getFileRoot, 
  getAllFileRoots, 
  indexFileRoot, 
  searchFiles, 
  readFile, 
  writeFile, 
  deleteFile, 
  copyFile, 
  moveFile, 
  createDirectory, 
  organizeFiles, 
  uploadFile, 
  downloadFile, 
  getClipboard, 
  setClipboard, 
  getClipboardHistory, 
  clearClipboardHistory, 
  getTransfer, 
  getAllTransfers, 
  cancelTransfer, 
  getFileStats, 
  subscribeToFiles, 
  filesEngine,
  FILE_OPERATIONS, 
  MIME_CATEGORIES, 
  SEARCH_MODES
} from "./filesEngine.js";

  export const HEY = {
    initialize: initializeHEY,

    computer: {
      registerTools: registerComputerTools,
      setAdapter: setComputerAdapter,
      initialize: initializeComputerControl,
      execute: executeComputerControl,
      setMode: setControlMode,
      getMode: getControlMode,
      getCapabilities: getComputerCapabilities,
      getHistory: getCommandHistory,
      clearHistory: clearCommandHistory,
      connectPhone,
      disconnectPhone,
      getPhoneConnection,
      isPhoneConnected,
      executePhone: executePhoneCapability,
      executeBrowser: executeBrowserCapability,
      executeComputer: executeComputerCapability,
      getAdapters: getAvailableAdapters,
      modes: CONTROL_MODES,
      computerCapabilities: COMPUTER_CAPABILITIES,
      phoneCapabilities: PHONE_CAPABILITIES,
      browserCapabilities: BROWSER_CAPABILITIES,
},

    computerControl: {
      engine: computerControlEngine,
      initialize: initializeComputerControl,
      execute: executeComputerControl,
      setMode: setControlMode,
      getMode: getControlMode,
      getCapabilities: getComputerCapabilities,
      getHistory: getCommandHistory,
      clearHistory: clearCommandHistory,
      connectPhone,
      disconnectPhone,
      getPhoneConnection,
      isPhoneConnected,
      executePhone: executePhoneCapability,
      executeBrowser: executeBrowserCapability,
      executeComputer: executeComputerCapability,
      getAdapters: getAvailableAdapters,
      subscribe: subscribeToComputerControl,
      modes: CONTROL_MODES,
      computerCapabilities: COMPUTER_CAPABILITIES,
      phoneCapabilities: PHONE_CAPABILITIES,
      browserCapabilities: BROWSER_CAPABILITIES,
    },

    files: {
      engine: filesEngine,
      addRoot: addFileRoot,
      removeRoot: removeFileRoot,
      getRoot: getFileRoot,
      allRoots: getAllFileRoots,
      indexRoot: indexFileRoot,
      search: searchFiles,
      read: readFile,
      write: writeFile,
      delete: deleteFile,
      copy: copyFile,
      move: moveFile,
      createDirectory,
      organize: organizeFiles,
      upload: uploadFile,
      download: downloadFile,
      getClipboard,
      setClipboard,
      getClipboardHistory,
      clearClipboardHistory,
      getTransfer,
      allTransfers: getAllTransfers,
      cancelTransfer,
      getStats: getFileStats,
      subscribe: subscribeToFiles,
      operations: FILE_OPERATIONS,
      mimeCategories: MIME_CATEGORIES,
      searchModes: SEARCH_MODES,
    },

    capabilities: {
      all: listCapabilities,
      get: getCapability,
      availability: getCapabilityAvailability,
      register: registerCapability,
      execute: executeCapability,
    },
   
    process: processInput,
    input: processInputFusion,
    inputFusion: {
      process: processInputFusion,
      text: createTextInput,
      voice: createVoiceInput,
      image: createImageInput,
      screen: createScreenInput,
      gesture: createGestureInput,
      file: createFileInput,
      selection: createSelectionInput,
      event: createEventInput,
      modalities: MODALITIES,
      stages: INPUT_STAGES,
    },

    commands: {
      parse: parseNaturalCommand,
    },

    modes: {
      get: getMode,
      all: listModes,
      register: registerMode,
    },
  
    remember: rememberUserInformation,
  
    state: getHEYState,
  
    status: getSystemStatus,
  
    createTask: createAgentTask,

    missions: {
      create: createMission,
      get: getMission,
      all: getAllMissions,
      active: getActiveMissions,
      byState: getMissionsByState,
      byProject: getMissionsByProject,
      update: updateMission,
      setState: setMissionState,
      start: startMission,
      pause: pauseMission,
      resume: resumeMission,
      cancel: cancelMission,
      retry: retryMission,
      updateStep: updateMissionStep,
      createCheckpoint: createMissionCheckpoint,
      restoreCheckpoint: restoreMissionCheckpoint,
      SupabaseMissionCheckpointStore,
      getProgress: getMissionProgress,
      getReplay: getMissionReplay,
      delete: deleteMission,
      subscribe: subscribeToMissions,
      states: MISSION_STATES,
      stepStates: STEP_STATES,
    },
  
    personality: heyPersonality,
  
    context: {
      get: getContext,
      updateUser: updateUserContext,
      addMemory,
      addImportantFact,
      setAgent: setActiveAgent,
      setMode: setActiveMode,
    },
  
    memory: {
      store: storeMemory,
      search: searchMemory,
      summary: buildMemorySummary,
      graph: getCosmosGraph,
      neighborhood: getMemoryNeighborhood,
      connect: connectMemories,
      upsertNode: upsertMemoryNode,
      searchGraph: searchMemoryGraph,
      clearGraph: clearMemoryGraph,
    },

    cosmos: {
      ingest: ingestMemory,
      retrieve: retrieveMemories,
      update: updateMemory,
      supersede: supersedeMemory,
      delete: deleteMemory,
      connect: connectMemories,
      getGraph: getCosmosGraph,
      contradictions: getContradictions,
      candidates: getCandidates,
      getCandidate: getCandidate,
      approveCandidate: approveCandidate,
      rejectCandidate: rejectCandidate,
      tombstones: getTombstones,
      hasTombstone: hasTombstone,
      subscribe: subscribeToCosmos,
      types: MEMORY_TYPES,
      privacyScopes: PRIVACY_SCOPES,
      ingestionSources: INGESTION_SOURCES,
    },
  
    agents: {
      route: routeToAgent,
      all: getAvailableAgents,
      recommend: getAgentRecommendation,
    },

    planning: {
      create: createPlan,
      nextStep: getNextStep,
    },

    execution: {
      run: executeTask,
      request: executeRequest,
      toolForCommand: getToolForCommand,
      get: getRunningTask,
      all: getAllRunningTasks,
      stop: stopTask,
      runVerifiedStep,
      runVerifiedWorkflow,
    },

    voice: {
      states: VOICE_STATES,
      createState: createVoiceState,
      understandCommand: understandVoiceCommand,
      createDictationEditSession,
    },

    vision: {
      validate: validateImageInput,
      understand: understandImage,
      inspectScreen,
    },

    tools: {
      register: registerTool,
      unregister: unregisterTool,
      get: getTool,
      all: listTools,
      catalog: listToolCatalog,
      search: searchToolCatalog,
      run: runToolLibraryEntry,
      start: startToolLibraryEntry,
      stop: stopToolLibraryEntry,
      lifecycle: getToolLifecycleContract,
      execute: executeTool,
      preferences: toolLibraryPreferenceStore,
    },

    tasks: {
      create: createTask,
      update: updateTask,
      get: getTask,
      all: listTasks,
      remove: removeTask,
    },

    events: {
      subscribe,
      publish,
      publishOnce,
      replayPending,
      EventOutboxStoreContract,
      InMemoryEventOutboxStore,
      SupabaseEventOutboxStore,
      clear: clearEventListeners,
    },

    audit: {
      record: recordAudit,
      all: listAuditEntries,
      clear: clearAuditEntries,
    },

    permissions: {
      grant: grantPermission,
      revoke: revokePermission,
      has: hasPermission,
      all: listPermissions,
      request: requestPermission,
      execute: executeWithPermission,
    },

    devices: {
      SupabaseDeviceCommandQueueStore,
      registerAdapter: registerDeviceAdapter,
      unregisterAdapter: unregisterDeviceAdapter,
      register: registerDevice,
      unregister: unregisterDevice,
      revoke: revokeDevice,
      all: listDevices,
      get: getDevice,
      capabilities: getDeviceCapabilities,
      adapters: listDeviceAdapters,
      execute: executeOnDevice,
    },

    proactive: {
      create: createProactiveSuggestion,
      evaluate: evaluateProactiveSignals,
      explain: explainSuggestion,
    },

    workflows: {
      create: createWorkflow,
      run: runWorkflow,
      runVerified: runVerifiedWorkflow,
    },

    skills: {
      create: createSkill,
      all: listSkills,
      get: getSkill,
      update: updateSkill,
      run: runSkill,
    },

    briefing: {
      create: createMorningBriefing,
    },

    quality: {
      evaluate: evaluateResponse,
      instruction: buildQualityInstruction,
    },

    actions: {
      create: createAction,
      all: listActions,
      get: getAction,
      approve: approveAction,
      execute: executeAction,
      undo: undoAction,
    },

    mandates: {
      issue: issueActionMandate,
      verifyAndConsume: verifyAndConsumeMandate,
      InMemoryMandateStore,
      MandateStoreContract,
      SupabaseMandateStore,
    },

    evidence: {
      createEnvelope: createEvidenceEnvelope,
      verifyEnvelope: verifyEvidenceEnvelope,
      invalidate: invalidateEvidence,
      InMemoryEvidenceStore,
      EvidenceStoreContract,
      SupabaseEvidenceStore,
      format: EVIDENCE_ENVELOPE_FORMAT,
      contractVersion: EVIDENCE_STORE_CONTRACT_VERSION,
    },

    releaseGate: {
      evaluate: evaluateReleaseGate,
      createInventoryAttestationBody: createReleaseInventoryAttestationBody,
    },

    integrationMigration: {
      plan: planIntegrationMigration,
      dispositions: INTEGRATION_MIGRATION_DISPOSITIONS,
    },

    forge: {
      validate: validateForgeArtifact,
      preview: createForgePreview,
    },

    providers: {
      register: registerProvider,
      attachEvaluationReport,
      unregister: unregisterProvider,
      get: getProvider,
      all: listProviders,
      models: listModels,
      clear: clearProviders,
      select: selectModel,
      plan: createProviderPlan,
      fusionModes: FUSION_MODES,
      runFusion: runProviderFusion,
    },

    modelPlatform: {
      createModelRecord,
      createEvaluationReport,
      verifyEvaluationReport,
      createAdapterManifest,
      createAdapterServingTarget,
      createInferenceRequest,
      profiles: INFERENCE_PROFILES,
      openCandidates: OPEN_MODEL_CANDIDATES,
    },

    memoryInbox: {
      autoApprove: memoryAutoApprove,
      setAutoApprove: setMemoryAutoApprove,
      queue: queueMemory,
      all: listInbox,
      pending: countPending,
      approve: approveMemory,
      reject: rejectMemory,
      clear: clearInbox,
    },

    fabric: {
      deviceId: getDeviceId,
      deviceName: getDeviceName,
      renameDevice,
      start: startFabric,
      peers: listPeers,
      handoff: requestHandoff,
      bundle: getHandoffBundle,
      clearBundle: clearHandoffBundle,
      accept: acceptHandoff,
      pairCode: producePairCode,
      registerPairCode,
      currentPairCode: getPairCode,
    },

    precision: {
      createContract: createPinpointContract,
      verify: verifyPinpointChange,
      applyLock,
      removeLock,
      getLocks,
      savePreset: saveLockPreset,
      getPreset: getLockPreset,
      copyLocks,
      inspect: inspectChanges,
      createVersion: createPinpointVersion,
      getVersion: getPinpointVersion,
      createBranch,
      getBranch,
      addVersionToBranch,
      mergeVersions: mergePinpointVersions,
      cherryPickChange: cherryPickPinpointChange,
      compareVersions: comparePinpointVersions,
      restoreVersion: restorePinpointVersion,
      markApproved: markPinpointApproved,
      markFinal: markPinpointFinal,
      archiveVersion,
      deleteVersion,
      listVersions,
      getVersionHistory: getPinpointVersionHistory,
      getBranches: getPinpointBranches,
      getVersionGraph: getPinpointVersionGraph,
      lockTypes: LOCK_TYPES,
      invariantClasses: INVARIANT_CLASSES,
      changeStatus: CHANGE_STATUS,
      repairActions: REPAIR_ACTIONS,
    },

    projectDNA: {
      create: createProjectDNA,
      get: getProjectDNA,
      update: updateProjectDNA,
      checkConsistency: checkProjectConsistency,
      list: listProjectDNAs,
      delete: deleteProjectDNA,
      export: exportProjectDNA,
      import: importProjectDNA,
      setLock: setProjectLock,
      getLocks: getProjectLocks,
      removeLock: removeProjectLock,
      fields: DNA_FIELDS,
      driftTypes: DRIFT_TYPES,
      rulePrecedence: RULE_PRECEDENCE,
      lockTypes: DNA_LOCK_TYPES,
    },

    onboarding: {
      engine: onboardingEngine,
      tutorialEngine,
      start: startOnboarding,
      getProgress: getOnboardingProgress,
      completeStage: completeOnboardingStage,
      skipStage: skipOnboardingStage,
      setLocale: setOnboardingLocale,
      setAccessibility: setOnboardingAccessibility,
      setStarterSpaces: setOnboardingStarterSpaces,
      getStarterSpaces: getOnboardingStarterSpaces,
      selectPracticeTask,
      completePracticeTask,
      getPracticeTasks,
      getSteps: getOnboardingSteps,
      dismissSuggestion: dismissOnboardingSuggestion,
      isSuggestionDismissed: isOnboardingSuggestionDismissed,
      reset: resetOnboarding,
      subscribe: subscribeToOnboarding,
      registerTutorial,
      getTutorial,
      getTutorialProgress,
      startTutorial,
      completeStep: completeTutorialStep,
      skipTutorial,
      completeTutorial,
      resetTutorial,
      stages: ONBOARDING_STAGES,
      steps: ONBOARDING_STEPS,
      practiceTasks: PRACTICE_TASKS,
      defaultTutorials,
    },

    workspace: {
      engine: workspaceEngine,
      createWidget,
      getWidget,
      getAllWidgets,
      getWidgetsByFamily,
      getActiveWidgets,
      updateWidget,
      setState: setWidgetState,
      move: moveWidget,
      resize: resizeWidget,
      bringToFront: bringWidgetToFront,
      sendToBack: sendWidgetToBack,
      pin: pinWidget,
      group: groupWidgets,
      ungroup: ungroupWidgets,
      dock: dockWidget,
      undock: undockWidget,
      close: closeWidget,
      delete: deleteWidget,
      semanticDrop: handleSemanticDrop,
      saveLayout,
      loadLayout,
      getLayouts,
      deleteLayout,
      handleMonitorChange,
      subscribe: subscribeToWorkspace,
      states: WIDGET_STATES,
      families: WIDGET_FAMILIES,
      dragTypes: DRAG_TYPES,
      snapModes: SNAP_MODES,
    },

    spaces: {
      engine: spaceCreationEngine,
      previewNaturalLanguageCreation: previewNaturalLanguageSpaceCreation,
      confirmNaturalLanguageCreation: confirmNaturalLanguageSpaceCreation,
      getPrivateSpaces,
      getLayoutPreferences: getSpaceLayoutPreferences,
      updateLayoutPreferences: updateSpaceLayoutPreferences,
      setToolMembership: setSpaceToolMembership,
      subscribe: subscribeToPrivateSpaces,
      contractVersion: SPACE_CREATION_CONTRACT_VERSION,
      storageContractVersion: SPACE_STORAGE_CONTRACT_VERSION,
      layoutPreferencesContractVersion: SPACE_LAYOUT_PREFERENCES_CONTRACT_VERSION,
      limits: SPACE_CREATION_LIMITS,
    },

    artifacts: {
      create: createArtifact,
      get: getArtifact,
      update: updateArtifact,
      createVersion,
      branch: branchArtifact,
      merge: mergeVersions,
      cherryPick: cherryPickChange,
      getVersion,
      getHistory: getVersionHistory,
      getBranches,
      compare: compareVersions,
      restore: restoreVersion,
      approve: markApproved,
      finalize: markFinal,
      archive: archiveArtifact,
      delete: deleteArtifact,
      list: listArtifacts,
      getGraph: getVersionGraph,
      types: ARTIFACT_KINDS,
      statuses: ARTIFACT_STATUS,
    },

    teacher: {
      buildLessonArtifact: buildTeacherLessonArtifact,
      verifyLessonArtifact: verifyTeacherLessonArtifact,
      saveLessonArtifact: saveTeacherLessonArtifact,
      exportLessonMarkdown: exportTeacherLessonMarkdown,
      buildAssessmentArtifact: buildTeacherAssessmentArtifact,
      verifyAssessmentArtifact: verifyTeacherAssessmentArtifact,
      saveAssessmentArtifact: saveTeacherAssessmentArtifact,
      exportAssessmentMarkdown: exportTeacherAssessmentMarkdown,
    },

    live: {
      createSession: createLiveSession,
      startSession: startLiveSession,
      addSource: addLiveSource,
      switchSource: switchLiveSource,
      removeSource: removeLiveSource,
      processInput: processLiveInput,
      executeAction: executeLiveAction,
      updateOverlay: updateLiveOverlay,
      addHighlight: addLiveHighlight,
      removeHighlight: removeLiveHighlight,
      addLabel: addLiveLabel,
      addArrow: addLiveArrow,
      addStepMarker: addLiveStepMarker,
      dimArea: dimLiveArea,
      pause: pauseLiveSession,
      resume: resumeLiveSession,
      stop: stopLiveSession,
      getSession: getLiveSession,
      getActiveSession: getActiveLiveSession,
      listSessions: listLiveSessions,
      setMode: setLiveMode,
      grantPermission: grantLivePermission,
      revokePermission: revokeLivePermission,
      getMetrics: getLiveSessionMetrics,
      reconnect: reconnectLiveSession,
      states: LIVE_STATES,
      modes: LIVE_MODES,
      sourceTypes: SOURCE_TYPES,
    },

    island: {
      create: createDynamicIsland,
      get: getDynamicIsland,
      getDefault: getDefaultDynamicIsland,
      list: listDynamicIslands,
      updateSettings: updateDynamicIslandSettings,
      addActivity: addIslandActivity,
      updateActivity: updateIslandActivity,
      removeActivity: removeIslandActivity,
      dismissActivity: dismissIslandActivity,
      pinActivity: pinIslandActivity,
      unpinActivity: unpinIslandActivity,
      setState: setIslandState,
      toggleExpanded: toggleIslandExpanded,
      handleInteraction: handleIslandInteraction,
      addModule: addIslandModule,
      removeModule: removeIslandModule,
      updateModule: updateIslandModule,
      enableModule: enableIslandModule,
      disableModule: disableIslandModule,
      getVisibleActivities: getVisibleIslandActivities,
      cleanupExpired: cleanupExpiredIslandActivities,
      completeActivity: completeIslandActivity,
      errorActivity: errorIslandActivity,
      destroy: destroyDynamicIsland,
      states: ISLAND_STATES,
      activityTypes: ACTIVITY_TYPES,
    },

    background: {
      start: startBackgroundHelper,
      stop: stopBackgroundHelper,
      pause: pauseBackgroundHelper,
      resume: resumeBackgroundHelper,
      getState: getBackgroundHelperState,
      isCapabilityEnabled: isBackgroundCapabilityEnabled,
      enableCapability: enableBackgroundCapability,
      disableCapability: disableBackgroundCapability,
      runTask: runBackgroundTask,
      cancelTask: cancelBackgroundTask,
      handleCloseBehavior: handleBackgroundCloseBehavior,
      states: HELPER_STATES,
      capabilities: BACKGROUND_CAPABILITIES,
    },

    generation: {
      registerProvider: registerGenerationProvider,
      unregisterProvider: unregisterGenerationProvider,
      getProvider: getGenerationProvider,
      listProviders: listGenerationProviders,
      setRoutingRule: setGenerationRoutingRule,
      getRoutingRule: getGenerationRoutingRule,
      setDefaultStrategy: setDefaultGenerationStrategy,
      generateImage,
      generateVideo,
      generateAudio,
      generateFrame,
      generateSpeech,
      getJob: getGenerationJob,
      getActiveJobs: getActiveGenerationJobs,
      getHistory: getGenerationHistory,
      cancelJob: cancelGenerationJob,
      retryJob: retryGenerationJob,
      getProviderStats: getGenerationProviderStats,
      types: GENERATION_TYPES,
      providerCategories: PROVIDER_CATEGORIES,
      routingStrategies: ROUTING_STRATEGIES,
    },

    chat: {
      transport: chatTransportEngine,
      createConversation,
      getConversation,
      getAllConversations,
      getConversationsByProject,
      updateConversation,
      deleteConversation,
      archiveConversation,
      unarchiveConversation,
      createMessage,
      saveDraft,
      getDraft,
      clearDraft,
      sendMessage,
      streamMessage,
      branchConversation,
      addAttachment,
      uploadAttachment,
      exportConversation,
      importConversation,
      subscribe: subscribeToChat,
      states: CONVERSATION_STATES,
      messageStates: MESSAGE_STATES,
      attachmentStates: ATTACHMENT_STATES,
    },
};

export const events = HEY.events;
export const onboarding = HEY.onboarding;
export const spaces = HEY.spaces;
export { previewNaturalLanguageSpaceCreation, confirmNaturalLanguageSpaceCreation, getPrivateSpaces, getSpaceLayoutPreferences, updateSpaceLayoutPreferences, setSpaceToolMembership, subscribeToPrivateSpaces, SPACE_CREATION_CONTRACT_VERSION, SPACE_STORAGE_CONTRACT_VERSION, SPACE_LAYOUT_PREFERENCES_CONTRACT_VERSION, SPACE_CREATION_LIMITS };
export { planIntegrationMigration, INTEGRATION_MIGRATION_DISPOSITIONS };
export { understandVoiceCommand, createDictationEditSession };

export default HEY;
