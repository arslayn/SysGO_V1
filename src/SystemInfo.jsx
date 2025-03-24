// SystemInfo.jsx
import React, { useState } from "react";

const SystemInfo = ({ onUserSpecsUpdate }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSystemInfo = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch system info from the backend API
      const response = await fetch("http://localhost:5000/api/system-info");

      if (!response.ok) {
        throw new Error(
          `Error fetching system information: ${response.status}`
        );
      }

      const data = await response.json();

      // Format the data to match the expected structure
      const formattedSpecs = {
        cpu: `${data.cpu.brand} ${data.cpu.manufacturer} ${data.cpu.cores} cores at ${data.cpu.speed}`,
        ram: data.memory.total,
        gpu: data.gpu[0]?.model || "Unknown GPU",
        storage: data.storage
          .map((disk) => `${disk.size} ${disk.type}`)
          .join(", "),
      };

      onUserSpecsUpdate(formattedSpecs);
    } catch (err) {
      console.error("Error:", err);
      setError("Failed to fetch system information");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="system-info-section">
      <h2>Fetch Your System Information</h2>
      <button
        onClick={fetchSystemInfo}
        disabled={loading}
        className="fetch-button"
      >
        {loading ? "Fetching..." : "Fetch My System Specs"}
      </button>
      {error && <p className="error-message">{error}</p>}
    </div>
  );
};

export default SystemInfo;
