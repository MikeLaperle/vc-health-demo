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
// Managed Identity Token Fetch (App Service)
// ------------------------------
// App Service exposes these environment variables:
// - IDENTITY_ENDPOINT: base URL for MSI token endpoint
// - IDENTITY_HEADER: secret header value required by the endpoint
// We must call: GET {IDENTITY_ENDPOINT}?resource={RESOURCE}&api-version=2019-08-01
// with header: X-IDENTITY-HEADER: {IDENTITY_HEADER}
async function getAccessToken() {
  const endpoint = process.env.IDENTITY_ENDPOINT;
  const identityHeader = process.env.IDENTITY_HEADER;
  if (!endpoint || !identityHeader) {
    throw new Error('Managed Identity is not available: IDENTITY_ENDPOINT or IDENTITY_HEADER missing.');
  }

  // Verified ID service resource (application ID / audience)
  const resource = '3db474b9-6a0c-4840-96ac-1fceb342124f';

  const url = `${endpoint}?resource=${encodeURIComponent(resource)}&api-version=2019-08-01`;
  const response = await fetch(url, { headers: { 'X-IDENTITY-HEADER': identityHeader } });

  if (!response.ok) {
    const text = await response.text();
    console.error('>>> Managed Identity token fetch failed:', text);
    throw new Error(text);
  }

  const json = await response.json();
  if (!json.access_token) {
    throw new Error('Managed Identity token response missing access_token.');
  }
  return json.access_token;
}

// ------------------------------
// Issuance Request Helper
// ------------------------------
async function requestIssuance(manifestUrl, type) {
  console.log(`>>> requestIssuance called for type=${type}`);

  // Validate required env
  if (!process.env.AUTHORITY_DID) {
    throw new Error('Missing AUTHORITY_DID in environment.');
  }
  if (!process.env.TENANT_ID) {
    throw new Error('Missing TENANT_ID in environment.');
  }

  const token = await getAccessToken();

  const issuancePayload = {
    authority: process.env.AUTHORITY_DID,
    type: type,
    manifest: manifestUrl,
    callback: {
      url: 'https://cms-vcdemo-d7a6hehmh8d6akb3.eastus2-01.azurewebsites.net/api/callback',
      state: '12345'
    }
  };

  const apiUrl = `https://verifiedid.did.msidentity.com/v1.0/${process.env.TENANT_ID}/verifiableCredentials/issuanceRequests`;
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(issuancePayload)
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('>>> Issuance request failed:', text);
    throw new Error(text);
  }

  console.log('>>> Issuance request succeeded');
  return response.json();
}

// ------------------------------
// API Routes for Each Credential
// ------------------------------
function addIssuanceRoute(pathSuffix, manifestUrl, type) {
  app.get(`/api/issue/${pathSuffix}`, async (req, res) => {
    console.log(`>>> /api/issue/${pathSuffix} GET called`);
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
  'johns-hopkins',
  'https://cms-vcdemo-d7a6hehmh8d6akb3.eastus2-01.azurewebsites.net/manifests/johns-hopkins/manifest.json',
  'MedicalDoctorCredential'
);
addIssuanceRoute(
  'florida-license',
  'https://cms-vcdemo-d7a6hehmh8d6akb3.eastus2-01.azurewebsites.net/manifests/florida-license/manifest.json',
  'FloridaMedicalLicenseCredential'
);
addIssuanceRoute(
  'unitedhealth',
  'https://cms-vcdemo-d7a6hehmh8d6akb3.eastus2-01.azurewebsites.net/manifests/unitedhealth/manifest.json',
  'UnitedHealthEmployeeCredential'
);
addIssuanceRoute(
  'ama',
  'https://cms-vcdemo-d7a6hehmh8d6akb3.eastus2-01.azurewebsites.net/manifests/ama/manifest.json',
  'AMACredential'
);
addIssuanceRoute(
  'cms',
  'https://cms-vcdemo-d7a6hehmh8d6akb3.eastus2-01.azurewebsites.net/manifests/cms/manifest.json',
  'CMSProviderCredential'
);
addIssuanceRoute(
  'adventhealth',
  'https://cms-vcdemo-d7a6hehmh8d6akb3.eastus2-01.azurewebsites.net/manifests/adventhealth/manifest.json',
  'SurgicalPrivilegesCredential'
);

// ------------------------------
// Callback Endpoint
// ------------------------------
app.post('/api/callback', (req, res) => {
  console.log('>>> Callback received:', req.body);
  res.sendStatus(200);
});

// ------------------------------
// Debug endpoints (optional)
// ------------------------------
app.get('/debug-env', (req, res) => {
  res.json({
    AUTHORITY_DID: process.env.AUTHORITY_DID || null,
    TENANT_ID: process.env.TENANT_ID || null,
    IDENTITY_ENDPOINT: process.env.IDENTITY_ENDPOINT ? '[present]' : null,
    IDENTITY_HEADER: process.env.IDENTITY_HEADER ? '[present]' : null
  });
});

// ------------------------------
// Start Server
// ------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CMS-VC-demo running on port ${PORT}`));