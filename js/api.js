// api.js
(function() {
  "use strict";

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

  window.KeyAPI = { 
    getKeys, createKey, getKey, updateKey, deleteKey, 
    getPackages, createPackage, deletePackage, keyId 
  };
})();