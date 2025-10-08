const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

// ------------------------------
// Static file serving
// ------------------------------
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));
app.use('/logos', express.static(path.join(__dirname, 'public/logos')));

// Serve users.json from /data folder
app.get('/users.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'data', 'users.json'));
});

// ------------------------------
// Load demo users and track active user
// ------------------------------
const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json')));
let activeUserId = users[0].id; // default to first user

app.post('/api/setUser/:id', (req, res) => {
  const id = req.params.id;
  if (users.find(u => u.id === id)) {
    activeUserId = id;
    console.log(`>>> Active user set to ${id}`);
    res.sendStatus(200);
  } else {
    res.status(400).send("Unknown user");
  }
});

// ------------------------------
// Managed Identity Token Fetch (App Service)
// ------------------------------
async function getAccessToken() {
  const endpoint = process.env.IDENTITY_ENDPOINT;
  const identityHeader = process.env.IDENTITY_HEADER;
  if (!endpoint || !identityHeader) {
    throw new Error('Managed Identity not available (IDENTITY_ENDPOINT/IDENTITY_HEADER missing).');
  }

  const resource = '3db474b9-6a0c-4840-96ac-1fceb342124f'; // Verified ID Request Service
  const url = `${endpoint}?resource=${encodeURIComponent(resource)}&api-version=2019-08-01`;
  const response = await fetch(url, { headers: { 'X-IDENTITY-HEADER': identityHeader } });
  if (!response.ok) {
    const text = await response.text();
    console.error('>>> MSI token fetch failed:', text);
    throw new Error(text);
  }
  const json = await response.json();
  return json.access_token;
}

// ------------------------------
// Claims builder
// ------------------------------
function buildClaims(type, user) {
  switch (type) {
    case "UnitedHealthEmployeeCredential":
      return {
        firstName: user.firstName,
        lastName: user.lastName,
        employeeId: user.employeeId,
        department: user.department,
        jobTitle: user.jobTitle
      };
    case "FloridaMedicalLicenseCredential":
      return {
        firstName: user.firstName,
        lastName: user.lastName,
        licenseNumber: user.licenseNumber,
        licenseType: user.licenseType,
        licenseExpiration: user.licenseExpiration
      };
    case "MedicalDegreeCredential":
      return {
        firstName: user.firstName,
        lastName: user.lastName,
        degreeType: user.degreeType,
        fieldOfStudy: user.fieldOfStudy,
        graduationYear: user.graduationYear,
        institution: user.institution
      };
    case "AMACredential":
      return {
        firstName: user.firstName,
        lastName: user.lastName,
        amaId: user.amaId,
        membershipStatus: user.membershipStatus,
        membershipLevel: user.membershipLevel
      };
    case "CMSProviderCredential":
      return {
        firstName: user.firstName,
        lastName: user.lastName,
        npiNumber: user.npiNumber,
        cmsProviderId: user.cmsProviderId,
        practiceLocation: user.practiceLocation
      };
    default:
      return {};
  }
}

// ------------------------------
// Issuance Request Helper
// ------------------------------
async function requestIssuance(manifestUrl, type) {
  console.log(`>>> requestIssuance type=${type}`);

  const authority = process.env.AUTHORITY_DID;
  if (!authority) throw new Error('Missing AUTHORITY_DID in environment.');

  const token = await getAccessToken();
  const user = users.find(u => u.id === activeUserId);

  const payload = {
    authority,
    type,
    manifest: manifestUrl,
    callback: {
      url: 'https://cms-vcdemo-d7a6hehmh8d6akb3.eastus2-01.azurewebsites.net/api/callback',
      state: '12345',
      headers: {
        'api-key': process.env.CALLBACK_API_KEY || 'demo-api-key'
      }
    },
    registration: {
      clientName: 'CMS VC Demo'
    },
    claims: buildClaims(type, user)
  };

  // Debug log to confirm which user/claims are being sent
  console.log(">>> Active user:", activeUserId, "Claims:", JSON.stringify(payload.claims, null, 2));

  const apiUrl = 'https://verifiedid.did.msidentity.com/v1.0/verifiableCredentials/createIssuanceRequest';
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('>>> Issuance request failed:', text);
    throw new Error(text);
  }
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

// ------------------------------
// Define each credential route
// ------------------------------
addIssuanceRoute(
  'unitedhealth',
  'https://verifiedid.did.msidentity.com/v1.0/tenants/36584371-2a86-4e03-afee-c2ba00e5e30e/verifiableCredentials/contracts/dbd9bb8d-4f0a-ba5c-284a-bdc97fac6db6/manifest',
  'UnitedHealthEmployeeCredential'
);

addIssuanceRoute(
  'florida-license',
  'https://verifiedid.did.msidentity.com/v1.0/tenants/36584371-2a86-4e03-afee-c2ba00e5e30e/verifiableCredentials/contracts/c69b120b-77c5-a63c-b557-ab4675d4e738/manifest',
  'FloridaMedicalLicenseCredential'
);

addIssuanceRoute(
  'johns-hopkins',
  'https://verifiedid.did.msidentity.com/v1.0/tenants/36584371-2a86-4e03-afee-c2ba00e5e30e/verifiableCredentials/contracts/4c4c7acd-3669-ce88-adc0-3d0ddf7ff728/manifest',
  'MedicalDegreeCredential'
);

addIssuanceRoute(
  'ama',
  'https://verifiedid.did.msidentity.com/v1.0/tenants/36584371-2a86-4e03-afee-c2ba00e5e30e/verifiableCredentials/contracts/e213e5e9-be8a-3480-3a60-0a95fdb7fbd0/manifest',
  'AMACredential'
);

addIssuanceRoute(
  'cms',
  'https://verifiedid.did.msidentity.com/v1.0/tenants/36584371-2a86-4e03-afee-c2ba00e5e30e/verifiableCredentials/contracts/4e6c1b0c-249a-94db-385e-4ad51f70712f/manifest',
  'CMSProviderCredential'
);

addIssuanceRoute(
  'adventhealth',
  'https://verifiedid.did.msidentity.com/v1.0/tenants/36584371-2a86-4e03-afee-c2ba00e5e30e/verifiableCredentials/contracts/3ed996b0-e605-78d1-b10e-12358d94775e/manifest',
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
// Start Server
// ------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CMS-VC-demo running on port ${PORT}`));

// ------------------------------
// End of File
// ------------------------------