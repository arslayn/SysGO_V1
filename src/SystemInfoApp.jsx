import React, { useState, useRef, useCallback } from "react";
import SystemInfo from "./SystemInfo";
import "./SystemInfoApp.css";

const SystemInfoApp = () => {
  // State for user's system specifications
  const [userSpecs, setUserSpecs] = useState({
    cpu: "",
    ram: "",
    gpu: "",
    storage: "",
  });

  // State for application compatibility checking
  const [appName, setAppName] = useState("");
  const [appRequirements, setAppRequirements] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [compatibilityResults, setCompatibilityResults] = useState(null);
  const [showComparison, setShowComparison] = useState(false);
  const [requirementType, setRequirementType] = useState("minimum"); // Default to minimum requirements

  // Reference to maintain focus on the app name input field
  const appNameInputRef = useRef(null);

  // Handler for updating system specifications from the SystemInfo component
  const handleUserSpecsUpdate = useCallback((specs) => {
    setUserSpecs(specs);
    setShowComparison(true);
  }, []);

  // Handler for app name input to prevent focus loss
  const handleAppNameChange = useCallback((e) => {
    setAppName(e.target.value);
  }, []);

  // Handler for requirement type change
  const handleRequirementTypeChange = useCallback(
    (e) => {
      setRequirementType(e.target.value);
      // If we already have requirements, update the comparison based on the new requirement type
      if (appRequirements && userSpecs.cpu) {
        compareSpecsWithRequirements(
          userSpecs,
          appRequirements[e.target.value] || appRequirements
        );
      }
    },
    [appRequirements, userSpecs]
  );

  // Function to fetch application requirements from the API
  const fetchAppRequirements = useCallback(async () => {
    // Validate input
    if (!appName.trim()) {
      setError("Please enter an application name");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Call the API to get application requirements
      const response = await fetch(
        "http://localhost:5000/api/app-requirements",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ applicationName: appName }),
        }
      );

      if (!response.ok) {
        throw new Error(`Error fetching requirements: ${response.status}`);
      }

      const data = await response.json();
      setAppRequirements(data.requirements);

      // Compare specs if we have user system information
      if (userSpecs.cpu) {
        compareSpecsWithRequirements(
          userSpecs,
          data.requirements[requirementType] || data.requirements
        );
      }
    } catch (err) {
      console.error("Error:", err);
      setError("Failed to fetch application requirements. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [appName, userSpecs, requirementType]);

  // Function to compare user specs with application requirements
  const compareSpecsWithRequirements = async (specs, requirements) => {
    try {
      // Try server-side compatibility check first
      const response = await fetch(
        "http://localhost:5000/api/compatibility-check",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userSpecs: specs,
            requirements,
            requirementType,
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        // Format server response for display
        const results = {
          cpu: {
            meets: data.compatibility.cpu.compatible === true,
            userSpec: data.compatibility.cpu.actual,
            requirement: data.compatibility.cpu.required,
          },
          ram: {
            meets: data.compatibility.memory.compatible,
            userSpec: data.compatibility.memory.actual,
            requirement: data.compatibility.memory.required,
          },
          gpu: {
            meets: data.compatibility.gpu.compatible === true,
            userSpec: data.compatibility.gpu.actual,
            requirement: data.compatibility.gpu.required,
          },
          storage: {
            meets: data.compatibility.storage.compatible,
            userSpec: data.compatibility.storage.actual,
            requirement: data.compatibility.storage.required,
          },
          overallCompatible: data.compatibility.overall,
          requirementType: requirementType,
        };
        setCompatibilityResults(results);
        return;
      }
    } catch (err) {
      console.error("Backend compatibility check failed:", err);
      console.log("Using frontend logic as fallback");
      // Continue to frontend fallback if server check fails
    }

    // Fallback: client-side compatibility check
    const results = {
      cpu: {
        meets: checkCpuCompatibility(specs.cpu, requirements.cpu),
        userSpec: specs.cpu,
        requirement: requirements.cpu,
      },
      ram: {
        meets: checkRamCompatibility(specs.ram, requirements.ram),
        userSpec: specs.ram,
        requirement: requirements.ram,
      },
      gpu: {
        meets: checkGpuCompatibility(specs.gpu, requirements.gpu),
        userSpec: specs.gpu,
        requirement: requirements.gpu,
      },
      storage: {
        meets: checkStorageCompatibility(specs.storage, requirements.storage),
        userSpec: specs.storage,
        requirement: requirements.storage,
      },
      overallCompatible: false,
      requirementType: requirementType,
    };

    // Determine overall compatibility status
    results.overallCompatible =
      results.cpu.meets &&
      results.ram.meets &&
      results.gpu.meets &&
      results.storage.meets;

    setCompatibilityResults(results);
  };

  // Compatibility check helper functions
  const checkCpuCompatibility = (userCpu, requiredCpu) => {
    return (
      userCpu.toLowerCase().includes(requiredCpu.toLowerCase()) ||
      requiredCpu.toLowerCase().includes("any")
    );
  };

  const checkRamCompatibility = (userRam, requiredRam) => {
    const userGB = extractNumberFromString(userRam);
    const requiredGB = extractNumberFromString(requiredRam);
    return userGB >= requiredGB;
  };

  const checkGpuCompatibility = (userGpu, requiredGpu) => {
    return (
      userGpu.toLowerCase().includes(requiredGpu.toLowerCase()) ||
      requiredGpu.toLowerCase().includes("any")
    );
  };

  const checkStorageCompatibility = (userStorage, requiredStorage) => {
    const userGB = extractNumberFromString(userStorage);
    const requiredGB = extractNumberFromString(requiredStorage);
    return userGB >= requiredGB;
  };

  const extractNumberFromString = (str) => {
    const matches = str.match(/(\d+)/);
    return matches ? parseInt(matches[0], 10) : 0;
  };

  // Helper to get the correct requirements based on current selection
  const getCurrentRequirements = () => {
    if (!appRequirements) return null;
    return appRequirements[requirementType] || appRequirements;
  };

  return (
    <div className="system-info-app-container">
      <header className="app-header">
        <h1>System Performance Analyzer</h1>
        <p>
          Analyze your system specs and compare with application requirements
        </p>
      </header>

      {/* System Information Component */}
      <SystemInfo onUserSpecsUpdate={handleUserSpecsUpdate} />

      {/* User Specifications Display */}
      {userSpecs.cpu && (
        <div className="specs-summary">
          <h2>Your System Specifications</h2>
          <div className="specs-grid">
            <div className="spec-item">
              <h3>CPU</h3>
              <p>{userSpecs.cpu}</p>
            </div>
            <div className="spec-item">
              <h3>RAM</h3>
              <p>{userSpecs.ram}</p>
            </div>
            <div className="spec-item">
              <h3>GPU</h3>
              <p>{userSpecs.gpu}</p>
            </div>
            <div className="spec-item">
              <h3>Storage</h3>
              <p>{userSpecs.storage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Application Compatibility Section */}
      {showComparison && (
        <div className="comparison-section">
          <h2>Application Compatibility</h2>
          <div className="app-input-section">
            <h2>Check Application Compatibility</h2>
            <div className="input-group">
              <input
                ref={appNameInputRef}
                type="text"
                value={appName}
                onChange={handleAppNameChange}
                placeholder="Enter application or game name"
                className="app-input"
              />
              <button
                onClick={fetchAppRequirements}
                disabled={isLoading || !userSpecs.cpu}
                className="check-button"
              >
                {isLoading ? "Checking..." : "Check Compatibility"}
              </button>
            </div>

            {/* Requirement Type Selection */}
            {appRequirements && (
              <div className="requirement-type-selector">
                <label htmlFor="requirement-type">Requirement Type:</label>
                <select
                  id="requirement-type"
                  value={requirementType}
                  onChange={handleRequirementTypeChange}
                  className="requirement-select"
                >
                  <option value="minimum">Minimum Requirements</option>
                  <option value="recommended">Recommended Requirements</option>
                </select>
              </div>
            )}

            {error && <p className="error-message">{error}</p>}
            {!userSpecs.cpu && (
              <p className="info-message">
                Please fetch your system specs first
              </p>
            )}

            {/* Application Requirements Display */}
            {appRequirements && (
              <div className="requirements-display">
                <h2>
                  {requirementType === "minimum" ? "Minimum" : "Recommended"}{" "}
                  Requirements for {appName}
                </h2>
                <div className="requirements-grid">
                  <div className="req-item">
                    <h3>CPU</h3>
                    <p>{getCurrentRequirements()?.cpu || "Not specified"}</p>
                  </div>
                  <div className="req-item">
                    <h3>RAM</h3>
                    <p>{getCurrentRequirements()?.ram || "Not specified"}</p>
                  </div>
                  <div className="req-item">
                    <h3>GPU</h3>
                    <p>{getCurrentRequirements()?.gpu || "Not specified"}</p>
                  </div>
                  <div className="req-item">
                    <h3>Storage</h3>
                    <p>
                      {getCurrentRequirements()?.storage || "Not specified"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Compatibility Results Display */}
            {compatibilityResults && (
              <div
                className={`compatibility-results ${
                  compatibilityResults.overallCompatible
                    ? "compatible"
                    : "incompatible"
                }`}
              >
                <h2>
                  {compatibilityResults.requirementType === "minimum"
                    ? "Minimum"
                    : "Recommended"}{" "}
                  Compatibility Results
                </h2>
                <div className="overall-result">
                  <h3>
                    {compatibilityResults.overallCompatible
                      ? "Compatible ✓"
                      : "Not Compatible ✗"}
                  </h3>
                  <p>
                    {compatibilityResults.overallCompatible
                      ? `Your system meets the ${compatibilityResults.requirementType} requirements to run ${appName}`
                      : `Your system does not meet all ${compatibilityResults.requirementType} requirements for ${appName}`}
                  </p>
                </div>

                <div className="detailed-results">
                  <div
                    className={`result-item ${
                      compatibilityResults.cpu.meets ? "meets" : "fails"
                    }`}
                  >
                    <h4>
                      CPU:{" "}
                      {compatibilityResults.cpu.meets
                        ? "Meets ✓"
                        : "Does Not Meet ✗"}
                    </h4>
                    <p>Required: {compatibilityResults.cpu.requirement}</p>
                    <p>Your CPU: {compatibilityResults.cpu.userSpec}</p>
                  </div>

                  <div
                    className={`result-item ${
                      compatibilityResults.ram.meets ? "meets" : "fails"
                    }`}
                  >
                    <h4>
                      RAM:{" "}
                      {compatibilityResults.ram.meets
                        ? "Meets ✓"
                        : "Does Not Meet ✗"}
                    </h4>
                    <p>Required: {compatibilityResults.ram.requirement}</p>
                    <p>Your RAM: {compatibilityResults.ram.userSpec}</p>
                  </div>

                  <div
                    className={`result-item ${
                      compatibilityResults.gpu.meets ? "meets" : "fails"
                    }`}
                  >
                    <h4>
                      GPU:{" "}
                      {compatibilityResults.gpu.meets
                        ? "Meets ✓"
                        : "Does Not Meet ✗"}
                    </h4>
                    <p>Required: {compatibilityResults.gpu.requirement}</p>
                    <p>Your GPU: {compatibilityResults.gpu.userSpec}</p>
                  </div>

                  <div
                    className={`result-item ${
                      compatibilityResults.storage.meets ? "meets" : "fails"
                    }`}
                  >
                    <h4>
                      Storage:{" "}
                      {compatibilityResults.storage.meets
                        ? "Meets ✓"
                        : "Does Not Meet ✗"}
                    </h4>
                    <p>Required: {compatibilityResults.storage.requirement}</p>
                    <p>Your Storage: {compatibilityResults.storage.userSpec}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <footer className="app-footer">
        <p>Powered by system information API and Gemini AI</p>
      </footer>
    </div>
  );
};

export default SystemInfoApp;
