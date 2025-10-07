const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(express.json());

// ------------------------------
// Static file serving
// ------------------------------
// Serve demo HTML + logos
app.use(express.static(path.join(__dirname, 'public')));
// Serve manifests so they are reachable at /manifests/*
app.use('/manifests', express.static(path.join(__dirname, 'manifests')));

// ------------------------------
// Managed Identity Token Fetch
// ------------------------------
async function getAccessToken() {
  const resource = "3db474b9-6a0c-4840-96ac-1fceb342124f"; // Verified ID resource
  const url = `http://169.254.169.254/metadata/identity/oauth2/token?api-version=2019-08-01&resource=${resource}`;
  const response = await fetch(url, { headers: { Metadata: "true" } });
  if (!response.ok) throw new Error(await response.text());
  const json = await response.json();
  return json.access_token;
}

// ------------------------------
// Issuance Request Helper
// ------------------------------
async function requestIssuance(manifestUrl, type) {
  const token = await getAccessToken();
  const issuancePayload = {
    authority: process.env.AUTHORITY_DID,
    type: type,
    manifest: manifestUrl,
    callback: {
      url: "https://cms-vcdemo-d7a6hehmh8d6akb3.eastus2-01.azurewebsites.net/api/callback",
      state: "12345"
    }
  };

  const response = await fetch(
    `https://verifiedid.did.msidentity.com/v1.0/${process.env.TENANT_ID}/verifiableCredentials/issuanceRequests`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(issuancePayload)
    }
  );

  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

// ------------------------------
// API Routes for Each Credential
// ------------------------------
function addIssuanceRoute(pathSuffix, manifestUrl, type) {
  // Support both POST (for API clients) and GET (for browser testing)
  app.post(`/api/issue/${pathSuffix}`, async (req, res) => {
    try {
      const result = await requestIssuance(manifestUrl, type);
      res.json(result);
    } catch (err) {
      res.status(500).send(err.message);
    }
  });
  app.get(`/api/issue/${pathSuffix}`, async (req, res) => {
    try {
      const result = await requestIssuance(manifestUrl, type);
      res.json(result);
    } catch (err) {
      res.status(500).send(err.message);
    }
  });
}

addIssuanceRoute(
  "johns-hopkins",
  "https://cms-vcdemo-d7a6hehmh8d6akb3.eastus2-01.azurewebsites.net/manifests/johns-hopkins/manifest.json",
  "MedicalDoctorCredential"
);
addIssuanceRoute(
  "florida-license",
  "https://cms-vcdemo-d7a6hehmh8d6akb3.eastus2-01.azurewebsites.net/manifests/florida-license/manifest.json",
  "FloridaMedicalLicenseCredential"
);
addIssuanceRoute(
  "unitedhealth",
  "https://cms-vcdemo-d7a6hehmh8d6akb3.eastus2-01.azurewebsites.net/manifests/unitedhealth/manifest.json",
  "UnitedHealthEmployeeCredential"
);
addIssuanceRoute(
  "ama",
  "https://cms-vcdemo-d7a6hehmh8d6akb3.eastus2-01.azurewebsites.net/manifests/ama/manifest.json",
  "AMACredential"
);
addIssuanceRoute(
  "cms",
  "https://cms-vcdemo-d7a6hehmh8d6akb3.eastus2-01.azurewebsites.net/manifests/cms/manifest.json",
  "CMSProviderCredential"
);
addIssuanceRoute(
  "adventhealth",
  "https://cms-vcdemo-d7a6hehmh8d6akb3.eastus2-01.azurewebsites.net/manifests/adventhealth/manifest.json",
  "SurgicalPrivilegesCredential"
);

// ------------------------------
// Callback Endpoint
// ------------------------------
app.post('/api/callback', (req, res) => {
  console.log("Callback received:", req.body);
  res.sendStatus(200);
});

// ------------------------------
// Start Server
// ------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CMS-VC-demo running on port ${PORT}`));