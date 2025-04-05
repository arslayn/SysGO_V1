const express = require('express');
const cors = require('cors');
const si = require('systeminformation');
// const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Replace Gemini API call with OpenRouter AI API call
const fetch = require('node-fetch');

// Cache for system information (refreshed every 5 minutes)
let systemInfoCache = null;
let systemInfoCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Cache for application requirements (refreshed every 24 hours)
const appRequirementsCache = new Map();
const APP_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Endpoint to get system information (with caching)
app.get('/api/system-info', async (req, res) => {
  try {
    const currentTime = Date.now();
    
    // Check if we have a valid cache
    if (systemInfoCache && (currentTime - systemInfoCacheTime < CACHE_DURATION)) {
      return res.json(systemInfoCache);
    }
    
    // Get CPU information
    const cpu = await si.cpu();
    
    // Get memory information
    const memData = await si.mem();
    const memory = {
      total: formatBytes(memData.total),
      free: formatBytes(memData.free),
      used: formatBytes(memData.used)
    };
    
    // Get GPU information
    const gpuData = await si.graphics();
    const gpu = gpuData.controllers.map(controller => ({
      model: controller.model,
      vram: controller.vram ? formatBytes(controller.vram * 1024 * 1024) : 'Unknown'
    }));
    
    // Get storage information
    const diskLayout = await si.diskLayout();
    const storage = diskLayout.map(disk => ({
      name: disk.name || 'Disk',
      size: formatBytes(disk.size),
      type: disk.type
    }));
    
    // Create the system information object
    const systemInfo = {
      cpu: {
        brand: cpu.brand,
        manufacturer: cpu.manufacturer,
        cores: cpu.cores,
        speed: `${cpu.speed} GHz`
      },
      memory,
      gpu,
      storage
    };
    
    // Update cache
    systemInfoCache = systemInfo;
    systemInfoCacheTime = currentTime;
    
    // Return the system information
    res.json(systemInfo);
  } catch (error) {
    console.error('Error fetching system information:', error);
    res.status(500).json({ error: 'Failed to fetch system information' });
  }
});

// Endpoint to get application requirements (with caching)
app.post('/api/app-requirements', async (req, res) => {
  try {
    const { applicationName } = req.body;
    
    if (!applicationName) {
      return res.status(400).json({ error: 'Application name is required' });
    }
    
    // Check if we have a valid cache for this application
    const cacheKey = applicationName.toLowerCase();
    const cachedData = appRequirementsCache.get(cacheKey);
    
    if (cachedData && (Date.now() - cachedData.timestamp < APP_CACHE_DURATION)) {
      return res.json({ requirements: cachedData.requirements });
    }
    
    // Create a prompt for OpenRouter AI to get both minimum and recommended system requirements
    const prompt = `
          Provide the minimum and recommended system requirements for ${applicationName} in the following JSON format:
          {
            "minimum": {
              "cpu": "CPU model or minimum specification",
              "ram": "Memory amount in GB",
              "gpu": "Graphics card model or minimum specification",
              "storage": "Storage amount in GB"
            },
            "recommended": {
              "cpu": "CPU model or recommended specification",
              "ram": "Memory amount in GB",
              "gpu": "Graphics card model or recommended specification",
              "storage": "Storage amount in GB"
            }
          }
          
          Provide only the JSON output without any additional text or markdown formatting.
    `;
    
    // Call OpenRouter AI API
    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-r1:free',
          messages: [{ role: 'user', content: prompt }],
        }),
      },
    );
    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content || 'No response received.';
    
    // Parse the response
    let requirements;
    try {
      // Handle case where OpenRouter AI might wrap the JSON in code blocks or add text
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : responseText;
      
      requirements = JSON.parse(jsonString);
      
      // Validate that the requirements object has the expected structure
      const validateSection = (section) => {
        const requiredFields = ["cpu", "ram", "gpu", "storage"];
        const missingFields = requiredFields.filter(field => !section[field]);
        return missingFields.length === 0;
      };
      
      if (!requirements.minimum || !validateSection(requirements.minimum) || 
          !requirements.recommended || !validateSection(requirements.recommended)) {
        throw new Error("Missing required fields in response");
      }
    } catch (parseError) {
      console.error("Error parsing OpenRouter AI response:", parseError);
      console.error("Raw response:", responseText);
      
      // Fallback with default requirements if parsing fails
      requirements = {
        minimum: {
          cpu: "Not available",
          ram: "4 GB",
          gpu: "Not available",
          storage: "10 GB"
        },
        recommended: {
          cpu: "Not available",
          ram: "8 GB",
          gpu: "Not available",
          storage: "20 GB"
        }
      };
    }
    
    // Update cache
    appRequirementsCache.set(cacheKey, {
      requirements,
      timestamp: Date.now()
    });
    
    // Return the requirements
    return res.json({ requirements });
    
  } catch (error) {
    console.error("Error fetching application requirements:", error);
    // Provide fallback requirements instead of failing
    const fallbackRequirements = {
      minimum: {
        cpu: "Not available",
        ram: "4 GB", 
        gpu: "Not available",
        storage: "10 GB"
      },
      recommended: {
        cpu: "Not available",
        ram: "8 GB",
        gpu: "Not available",
        storage: "20 GB"
      }
    };
    return res.json({ 
      requirements: fallbackRequirements,
      note: "Using fallback requirements due to API error"
    });
  }
});

// Endpoint to compare system info with app requirements
app.post('/api/compatibility-check', async (req, res) => {
  try {
    const { userSpecs, requirements, requirementType = 'minimum' } = req.body;
    
    if (!requirements) {
      return res.status(400).json({ error: 'Application requirements are needed for compatibility check' });
    }
    
    // Use the requirements based on the selected type (fallback to provided requirements if flat structure)
    const reqToCheck = requirements[requirementType] || requirements;

    // Use provided userSpecs if available, otherwise fetch from system
    let cpuInfo, memInfo, gpuInfo, storageInfo;
    
    if (userSpecs) {
      // Use provided specs
      cpuInfo = userSpecs.cpu;
      memInfo = userSpecs.ram || userSpecs.memory;  // Allow for both naming conventions
      gpuInfo = userSpecs.gpu;
      storageInfo = userSpecs.storage;
    } else {
      // Get system information
      const cpu = await si.cpu();
      const memData = await si.mem();
      const gpuData = await si.graphics();
      const diskLayout = await si.diskLayout();
      
      cpuInfo = `${cpu.brand} ${cpu.manufacturer} ${cpu.cores} cores at ${cpu.speed} GHz`;
      memInfo = `${(memData.total / (1024 * 1024 * 1024)).toFixed(2)} GB`;
      gpuInfo = gpuData.controllers.map(c => c.model).join(', ');
      storageInfo = `${(diskLayout.reduce((total, disk) => total + disk.size, 0) / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    
    // Parse memory values (improved regex to better handle various formats)
    const userMemGB = parseFloat(memInfo.toString().replace(/[^0-9.]/g, ''));
    const reqMemGB = parseFloat(reqToCheck.ram.toString().replace(/[^0-9.]/g, ''));
    
    // Parse storage values (improved regex to better handle various formats)
    const userStorageGB = parseFloat(storageInfo.toString().replace(/[^0-9.]/g, ''));
    const reqStorageGB = parseFloat(reqToCheck.storage.toString().replace(/[^0-9.]/g, ''));
    
    // Improved CPU compatibility check with smarter matching
    const cpuCompatible = 
      // If requirement mentions "any CPU", it's compatible
      reqToCheck.cpu.toLowerCase().includes("any") ||
      // Direct match
      cpuInfo.toLowerCase().includes(reqToCheck.cpu.toLowerCase()) ||
      // Check if CPU GHz is mentioned and compare
      (reqToCheck.cpu.toLowerCase().includes("ghz") && 
       parseFloat(cpuInfo.match(/(\d+\.\d+)\s*GHz/i)?.[1] || 0) >= 
       parseFloat(reqToCheck.cpu.match(/(\d+\.\d+)\s*GHz/i)?.[1] || 0)) ||
      // Check if CPU cores are mentioned and compare
      (reqToCheck.cpu.toLowerCase().includes("core") && 
       parseInt(cpuInfo.match(/(\d+)\s*cores/i)?.[1] || 0) >= 
       parseInt(reqToCheck.cpu.match(/(\d+)\s*cores?/i)?.[1] || 0));
    
    // Improved GPU compatibility check with smarter matching
    const gpuCompatible = 
      // If requirement mentions "any GPU" or "integrated", it's compatible
      reqToCheck.gpu.toLowerCase().includes("any") || 
      reqToCheck.gpu.toLowerCase().includes("integrated") ||
      // Direct match
      gpuInfo.toLowerCase().includes(reqToCheck.gpu.toLowerCase()) || 
      // Check for common GPU series (NVIDIA, AMD, Intel)
      (gpuInfo.toLowerCase().includes("nvidia") && reqToCheck.gpu.toLowerCase().includes("nvidia")) ||
      (gpuInfo.toLowerCase().includes("amd") && reqToCheck.gpu.toLowerCase().includes("amd")) ||
      (gpuInfo.toLowerCase().includes("intel") && reqToCheck.gpu.toLowerCase().includes("intel"));
    
    const compatibility = {
      cpu: {
        actual: cpuInfo,
        required: reqToCheck.cpu,
        compatible: cpuCompatible
      },
      memory: {
        actual: memInfo,
        required: reqToCheck.ram,
        compatible: userMemGB >= reqMemGB || isNaN(reqMemGB)
      },
      gpu: {
        actual: gpuInfo,
        required: reqToCheck.gpu,
        compatible: gpuCompatible
      },
      storage: {
        actual: storageInfo,
        required: reqToCheck.storage,
        compatible: userStorageGB >= reqStorageGB || isNaN(reqStorageGB)
      },
      overall: false,
      requirementType: requirementType
    };
    
    // Set overall compatibility
    compatibility.overall = 
      compatibility.cpu.compatible &&
      compatibility.memory.compatible &&
      compatibility.gpu.compatible &&
      compatibility.storage.compatible;
    
    return res.json({ compatibility });
    
  } catch (error) {
    console.error("Error checking compatibility:", error);
    return res.status(500).json({ error: "Failed to check compatibility" });
  }
});

// Helper function to format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});