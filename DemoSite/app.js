const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(express.json());

// Serve static files (your HTML + logos)
app.use(express.static(path.join(__dirname, 'public')));

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
    authority: process.env.AUTHORITY_DID, // e.g. did:ion:xyz...
    type: type,
    manifest: manifestUrl,
    callback: {
      url: "https://cms-vc-demo.azurewebsites.net/api/callback",
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
app.post('/api/issue/johns-hopkins', async (req, res) => {
  try {
    const result = await requestIssuance(
      "https://cms-vc-demo.azurewebsites.net/manifests/johns-hopkins/manifest.json",
      "MedicalDoctorCredential"
    );
    res.json(result);
  } catch (err) { res.status(500).send(err.message); }
});

app.post('/api/issue/florida-license', async (req, res) => {
  try {
    const result = await requestIssuance(
      "https://cms-vc-demo.azurewebsites.net/manifests/florida-license/manifest.json",
      "FloridaMedicalLicenseCredential"
    );
    res.json(result);
  } catch (err) { res.status(500).send(err.message); }
});

app.post('/api/issue/unitedhealth', async (req, res) => {
  try {
    const result = await requestIssuance(
      "https://cms-vc-demo.azurewebsites.net/manifests/unitedhealth/manifest.json",
      "UnitedHealthEmployeeCredential"
    );
    res.json(result);
  } catch (err) { res.status(500).send(err.message); }
});

app.post('/api/issue/ama', async (req, res) => {
  try {
    const result = await requestIssuance(
      "https://cms-vc-demo.azurewebsites.net/manifests/ama/manifest.json",
      "AMACredential"
    );
    res.json(result);
  } catch (err) { res.status(500).send(err.message); }
});

app.post('/api/issue/cms', async (req, res) => {
  try {
    const result = await requestIssuance(
      "https://cms-vc-demo.azurewebsites.net/manifests/cms/manifest.json",
      "CMSProviderCredential"
    );
    res.json(result);
  } catch (err) { res.status(500).send(err.message); }
});

app.post('/api/issue/adventhealth', async (req, res) => {
  try {
    const result = await requestIssuance(
      "https://cms-vc-demo.azurewebsites.net/manifests/adventhealth/manifest.json",
      "SurgicalPrivilegesCredential"
    );
    res.json(result);
  } catch (err) { res.status(500).send(err.message); }
});

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