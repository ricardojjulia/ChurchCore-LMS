/**
 * ChurchCore LMS SCORM 1.2 & SCORM 2004 Runtime Bridge
 * Implements window.API (1.2) and window.API_1484_11 (2004) to communicate with LMS parent frame.
 */
;(function () {
  if (window.__CC_SCORM_INITIALIZED__) return
  window.__CC_SCORM_INITIALIZED__ = true

  var cmiData = {}
  var isInitialized = false
  var isTerminated = false
  var lastError = '0'

  function log() {
    // console.log('[SCORM Bridge]', ...arguments)
  }

  function notifyParent(action, payload) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          {
            type: 'CHURCHCORE_SCORM_EVENT',
            action: action,
            payload: payload || {},
            cmi: cmiData,
          },
          '*'
        )
      }
    } catch (e) {
      console.warn('Could not post SCORM message to parent:', e)
    }
  }

  // ── SCORM 1.2 API ──────────────────────────────────────────────────────────
  window.API = {
    LMSInitialize: function (param) {
      log('LMSInitialize', param)
      isInitialized = true
      isTerminated = false
      lastError = '0'
      notifyParent('INITIALIZE', { version: '1.2' })
      return 'true'
    },

    LMSGetValue: function (element) {
      log('LMSGetValue', element)
      lastError = '0'
      if (element === 'cmi.core._children') {
        return 'student_id,student_name,lesson_location,credit,lesson_status,entry,score,total_time,exit,session_time'
      }
      if (element === 'cmi.core.score._children') {
        return 'raw,min,max'
      }
      return cmiData[element] !== undefined ? String(cmiData[element]) : ''
    },

    LMSSetValue: function (element, value) {
      log('LMSSetValue', element, value)
      lastError = '0'
      cmiData[element] = value
      notifyParent('SET_VALUE', { element: element, value: value, version: '1.2' })
      return 'true'
    },

    LMSCommit: function (param) {
      log('LMSCommit', param)
      lastError = '0'
      notifyParent('COMMIT', { version: '1.2' })
      return 'true'
    },

    LMSFinish: function (param) {
      log('LMSFinish', param)
      isTerminated = true
      lastError = '0'
      notifyParent('FINISH', { version: '1.2' })
      return 'true'
    },

    LMSGetLastError: function () {
      return lastError
    },

    LMSGetErrorString: function (errorCode) {
      return errorCode === '0' ? 'No error' : 'General Error'
    },

    LMSGetDiagnostic: function (errorCode) {
      return 'Diagnostic: ' + errorCode
    },
  }

  // ── SCORM 2004 API ────────────────────────────────────────────────────────
  window.API_1484_11 = {
    Initialize: function (param) {
      log('2004 Initialize', param)
      isInitialized = true
      isTerminated = false
      lastError = '0'
      notifyParent('INITIALIZE', { version: '2004' })
      return 'true'
    },

    GetValue: function (element) {
      log('2004 GetValue', element)
      lastError = '0'
      return cmiData[element] !== undefined ? String(cmiData[element]) : ''
    },

    SetValue: function (element, value) {
      log('2004 SetValue', element, value)
      lastError = '0'
      cmiData[element] = value
      notifyParent('SET_VALUE', { element: element, value: value, version: '2004' })
      return 'true'
    },

    Commit: function (param) {
      log('2004 Commit', param)
      lastError = '0'
      notifyParent('COMMIT', { version: '2004' })
      return 'true'
    },

    Terminate: function (param) {
      log('2004 Terminate', param)
      isTerminated = true
      lastError = '0'
      notifyParent('FINISH', { version: '2004' })
      return 'true'
    },

    GetLastError: function () {
      return lastError
    },

    GetErrorString: function (errorCode) {
      return errorCode === '0' ? 'No error' : 'General Error'
    },

    GetDiagnostic: function (errorCode) {
      return 'Diagnostic: ' + errorCode
    },
  }

  // Listen for pre-filled CMI data from parent window (for suspend/resume)
  window.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'CHURCHCORE_SCORM_HYDRATE') {
      if (event.data.cmi && typeof event.data.cmi === 'object') {
        for (var k in event.data.cmi) {
          cmiData[k] = event.data.cmi[k]
        }
      }
    }
  })
})()
