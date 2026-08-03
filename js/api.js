// api.js
(function() {
  "use strict";

  console.log('✅ api.js đang được load...');

  const BASE = "https://keyb-2f31d-default-rtdb.asia-southeast1.firebasedatabase.app";

  async function request(path, options = {}) {
    const res = await fetch(`${BASE}${path}.json`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) throw new Error(`Firebase ${res.status}: ${res.statusText}`);
    return res.json();
  }

  const getKeys = () => request("/keys").then(d => d || {});
  const keyId = (key) => key.replace(/[.#$/\[\]]/g, "_");

  const createKey = (record) => request(`/keys/${keyId(record.key)}`, {
    method: "PUT",
    body: JSON.stringify(record),
  });

  const getKey = (key) => request(`/keys/${keyId(key)}`);
  
  const updateKey = (id, patch) => request(`/keys/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

  const deleteKey = (id) => request(`/keys/${id}`, { method: "DELETE" });

  const getPackages = () => request("/packages").then(d => d || {});
  
  const createPackage = (record) => request("/packages", {
    method: "POST",
    body: JSON.stringify(record),
  });

  const deletePackage = (id) => request(`/packages/${id}`, { method: "DELETE" });

  // ====== CÁC HÀM QUẢN LÝ BANNED UIDs ======
  
  const getBannedUIDs = () => {
    console.log('🔍 getBannedUIDs được gọi');
    return request("/banned_uids").then(d => d || {});
  };
  
  const banUID = (uid, reason) => request(`/banned_uids/${uid}`, {
    method: "PUT",
    body: JSON.stringify({
      banned: true,
      flagged: false,
      reason: reason || "Vi phạm điều khoản sử dụng",
      banned_at: Date.now()
    })
  });
  
  const unbanUID = (uid) => request(`/banned_uids/${uid}`, { method: "DELETE" });
  
  const flagUID = (uid, reason) => request(`/banned_uids/${uid}`, {
    method: "PUT",
    body: JSON.stringify({
      banned: false,
      flagged: true,
      reason: reason || "Đang theo dõi",
      flagged_at: Date.now()
    })
  });

  // ====== CÁC HÀM QUẢN LÝ THIẾT BỊ ======
  
  const getAllDeviceInfo = async () => {
    const keysData = await getKeys();
    const allDevices = {};
    
    for (const [keyId, keyData] of Object.entries(keysData)) {
      if (keyData.device_info) {
        for (const [uid, info] of Object.entries(keyData.device_info)) {
          allDevices[uid] = {
            ...info,
            keyId: keyId,
            keyName: keyData.key || keyId
          };
        }
      }
    }
    return allDevices;
  };
  
  const getUIDLoginHistory = (uid) => request(`/login_history/${uid}`).then(d => d || {});
  
  const logLogin = (uid, keyId, deviceInfo) => {
    const timestamp = Date.now();
    const logEntry = {
      timestamp: timestamp,
      keyId: keyId,
      device_info: deviceInfo || {},
      status: "success"
    };
    return request(`/login_history/${uid}/${timestamp}`, {
      method: "PUT",
      body: JSON.stringify(logEntry)
    });
  };

  const logFailedLogin = (uid, keyId, reason) => {
    const timestamp = Date.now();
    const logEntry = {
      timestamp: timestamp,
      keyId: keyId || 'unknown',
      reason: reason || 'Invalid key',
      status: "failed"
    };
    return request(`/login_history/${uid}/${timestamp}`, {
      method: "PUT",
      body: JSON.stringify(logEntry)
    });
  };

  // ====== SET APP ĐANG DÙNG ======
  const updateAppInfo = (keyId, appInfo) => {
    return request(`/keys/${keyId}/app_info`, {
      method: "PUT",
      body: JSON.stringify({
        ...appInfo,
        updated_at: Date.now()
      })
    });
  };

  const getAppInfo = (keyId) => request(`/keys/${keyId}/app_info`);

  // ====== SET THÔNG TIN THIẾT BỊ ======
  const updateDeviceInfo = (keyId, uid, deviceInfo) => {
    return request(`/keys/${keyId}/device_info/${uid}`, {
      method: "PUT",
      body: JSON.stringify({
        ...deviceInfo,
        last_seen: Date.now() / 1000
      })
    });
  };

  const getDeviceInfo = (keyId, uid) => request(`/keys/${keyId}/device_info/${uid}`);

  const getKeyDeviceInfo = (keyId) => request(`/keys/${keyId}/device_info`).then(d => d || {});

  // ====== THÔNG TIN APP & THIẾT BỊ CỦA TẤT CẢ KEY ======
  const getAllAppAndDeviceInfo = async () => {
    const keysData = await getKeys();
    const result = {};
    
    for (const [keyId, keyData] of Object.entries(keysData)) {
      result[keyId] = {
        keyName: keyData.key || keyId,
        app_info: keyData.app_info || null,
        device_info: keyData.device_info || {}
      };
    }
    return result;
  };

  const getAllLoginLogs = async () => {
    const logs = {};
    const uids = await request("/login_history").then(d => d || {});
    for (const [uid, logData] of Object.entries(uids)) {
      logs[uid] = logData;
    }
    return logs;
  };

  // ====== QUẢN LÝ BYPASS MENU ======
  const getMenuBypassStatus = () => request("/menu_bypass_status").then(d => d || {});
  
  const setMenuBypassStatus = (enabled) => {
    return request("/menu_bypass_status", {
      method: "PUT",
      body: JSON.stringify({
        enabled: enabled,
        updated_at: Date.now()
      })
    });
  };

  const getBypassMenuUIDs = () => request("/bypass_menu_uids").then(d => d || {});
  
  const enableBypassMenu = (uid) => request(`/bypass_menu_uids/${uid}`, {
    method: "PUT",
    body: JSON.stringify({
      enabled: true,
      updated_at: Date.now()
    })
  });
  
  const disableBypassMenu = (uid) => request(`/bypass_menu_uids/${uid}`, {
    method: "DELETE"
  });

  // ====== QUẢN LÝ KICK ======
  const getKickUIDs = () => request("/kick_uids").then(d => d || {});
  
  const addKickUID = (uid, reason) => request(`/kick_uids/${uid}`, {
    method: "PUT",
    body: JSON.stringify({
      kicked: true,
      reason: reason || "Bạn đã bị văng khỏi game!",
      kicked_at: Date.now()
    })
  });
  
  const removeKickUID = (uid) => request(`/kick_uids/${uid}`, { method: "DELETE" });
  
  const kickNow = (uid, reason) => {
    return request(`/kick_signal/${uid}`, {
      method: "PUT",
      body: JSON.stringify({
        action: "kick",
        reason: reason || "Bạn đã bị văng khỏi game!",
        timestamp: Date.now()
      })
    });
  };

  // ====== EXPORT ======
  console.log('📦 Đang export KeyAPI...');
  
  window.KeyAPI = { 
    // Key management
    getKeys, 
    createKey, 
    getKey, 
    updateKey, 
    deleteKey, 
    keyId,
    
    // Package management
    getPackages, 
    createPackage, 
    deletePackage,
    
    // Banned UIDs
    getBannedUIDs,
    banUID, 
    unbanUID, 
    flagUID,
    
    // Device management
    getAllDeviceInfo, 
    getUIDLoginHistory, 
    logLogin,
    logFailedLogin,
    
    // App info
    updateAppInfo, 
    getAppInfo,
    
    // Device info
    updateDeviceInfo, 
    getDeviceInfo, 
    getKeyDeviceInfo,
    
    // Combined info
    getAllAppAndDeviceInfo, 
    getAllLoginLogs,
    
    // Menu Bypass
    getMenuBypassStatus,
    setMenuBypassStatus,
    getBypassMenuUIDs,
    enableBypassMenu,
    disableBypassMenu,
    
    // Kick
    getKickUIDs,
    addKickUID,
    removeKickUID,
    kickNow
  };
  
  console.log('✅ KeyAPI đã được export:', Object.keys(window.KeyAPI));
  console.log('✅ getBannedUIDs:', typeof window.KeyAPI.getBannedUIDs);
})();