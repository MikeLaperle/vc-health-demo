const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(express.json());

// ------------------------------
// Static file serving
// ------------------------------
app.use(express.static(path.join(__dirname, 'public')));
app.use('/manifests', express.static(path.join(__dirname, 'manifests')));

// ------------------------------
// Managed Identity Token Fetch
// ------------------------------
async function getAccessToken() {
  const resource = "3db474b9-6a0c-4840-96ac-1fceb342124f"; // Verified ID resource
  const url = `http://169.254.169.254/metadata/identity/oauth2/token?api-version=2019-08-01&resource=${resource}`;
  const response = await fetch(url, { headers: { Metadata: "true" } });
  if (!response.ok) {
    const text = await response.text();
    console.error(">>> Managed Identity token fetch failed:", text);
    throw new Error(text);
  }
  const json = await response.json();
  return json.access_token;
}

// ------------------------------
// Issuance Request Helper
// ------------------------------
async function requestIssuance(manifestUrl, type) {
  console.log(`>>> requestIssuance called for type=${type}`);
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

  if (!response.ok) {
    const text = await response.text();
    console.error(">>> Issuance request failed:", text);
    throw new Error(text);
  }
  console.log(">>> Issuance request succeeded");
  return response.json();
}

// ------------------------------
// API Routes for Each Credential
// ------------------------------
function addIssuanceRoute(pathSuffix, manifestUrl, type) {
  app.get(`/api/issue/${pathSuffix}`, async (req, res) => {
    console.log(`>>> /api/issue/${pathSuffix} called`);
    try {
      const result = await requestIssuance(manifestUrl, type);
      res.json(result);
    } catch (err) {
      console.error(`>>> Error in /api/issue/${pathSuffix}:`, err.message);
      res.status(500).send(err.message);
    }
  });
  app.post(`/api/issue/${pathSuffix}`, async (req, res) => {
    console.log(`>>> /api/issue/${pathSuffix} POST called`);
    try {
      const result = await requestIssuance(manifestUrl, type);
      res.json(result);
    } catch (err) {
      console.error(`>>> Error in /api/issue/${pathSuffix}:`, err.message);
      res.status(500).send(err.message);
    }
  });
}

addIssuanceRoute(
  "unitedhealth",
  "https://cms-vcdemo-d7a6hehmh8d6akb3.eastus2-01.azurewebsites.net/manifests/unitedhealth/manifest.json",
  "UnitedHealthEmployeeCredential"
);
// repeat addIssuanceRoute(...) for johns-hopkins, florida-license, etc.

// ------------------------------
// Callback Endpoint
// ------------------------------
app.post('/api/callback', (req, res) => {
  console.log(">>> Callback received:", req.body);
  res.sendStatus(200);
});

// ------------------------------
// Start Server
// ------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CMS-VC-demo running on port ${PORT}`));