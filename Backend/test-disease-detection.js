const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Configuration
const API_BASE_URL = 'http://localhost:3000/api';
const TEST_IMAGE_PATH = path.join(__dirname, 'random_leaves', 'd1.jpg');
const TEST_EMAIL = 'diseasetest@example.com';
const TEST_PASSWORD = 'password123';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function login() {
  try {
    log('\n1. Logging in...', colors.blue);
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      identifier: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    const token = response.data.data.token;
    log(`✓ Login successful! Token: ${token.substring(0, 20)}...`, colors.green);
    return token;
  } catch (error) {
    if (error.response?.status === 401) {
      log('✗ Login failed - Invalid credentials. Please update TEST_EMAIL and TEST_PASSWORD in the script.', colors.red);
    } else {
      log(`✗ Login failed: ${error.message}`, colors.red);
      if (error.response?.data) {
        console.log('Response:', error.response.data);
      }
    }
    throw error;
  }
}

async function submitDetectionRequest(token) {
  try {
    log('\n2. Submitting disease detection request...', colors.blue);

    if (!fs.existsSync(TEST_IMAGE_PATH)) {
      throw new Error(`Test image not found at: ${TEST_IMAGE_PATH}`);
    }

    const form = new FormData();
    form.append('image', fs.createReadStream(TEST_IMAGE_PATH));

    const response = await axios.post(
      `${API_BASE_URL}/disease/submit`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    const { detectionId, imageUuid, status } = response.data.data;
    log(`✓ Detection request submitted!`, colors.green);
    log(`  Detection ID: ${detectionId}`, colors.magenta);
    log(`  Image UUID: ${imageUuid}`, colors.magenta);
    log(`  Status: ${status}`, colors.yellow);

    return detectionId;
  } catch (error) {
    log(`✗ Failed to submit detection request: ${error.message}`, colors.red);
    if (error.response?.data) {
      console.log('Response:', error.response.data);
    }
    throw error;
  }
}

async function getDetectionStatus(token, detectionId) {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/disease/requests/${detectionId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    return response.data.data;
  } catch (error) {
    log(`✗ Failed to get detection status: ${error.message}`, colors.red);
    throw error;
  }
}

async function pollDetectionStatus(token, detectionId, maxAttempts = 30, intervalMs = 2000) {
  log('\n3. Polling detection status...', colors.blue);
  log(`   Will check every ${intervalMs/1000}s for up to ${maxAttempts * intervalMs/1000}s`, colors.yellow);

  for (let i = 0; i < maxAttempts; i++) {
    const detection = await getDetectionStatus(token, detectionId);

    log(`\n   Attempt ${i + 1}/${maxAttempts}:`, colors.yellow);
    log(`   Status: ${detection.status}`, colors.magenta);

    if (detection.status === 'PROCESSING') {
      const processingTime = Date.now() - new Date(detection.processing_started_at).getTime();
      log(`   Processing for: ${Math.round(processingTime/1000)}s`, colors.yellow);
    }

    if (detection.status === 'COMPLETED') {
      log('\n✓ Detection completed successfully!', colors.green);
      log(`\n   Results:`, colors.blue);
      log(`   Disease: ${detection.detected_disease}`, colors.green);
      log(`   Confidence: ${detection.confidence}%`, colors.green);
      log(`   Confidence Score: ${detection.confidence_score}`, colors.magenta);

      if (detection.recommendations && detection.recommendations.length > 0) {
        log(`\n   Recommendations:`, colors.blue);
        detection.recommendations.forEach((rec, idx) => {
          log(`   ${idx + 1}. ${rec}`, colors.yellow);
        });
      }

      if (detection.all_predictions) {
        log(`\n   All Predictions:`, colors.blue);
        Object.entries(detection.all_predictions)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .forEach(([disease, score]) => {
            log(`   ${disease}: ${(score * 100).toFixed(2)}%`, colors.yellow);
          });
      }

      const totalTime = Date.now() - new Date(detection.uploaded_at).getTime();
      log(`\n   Total processing time: ${Math.round(totalTime/1000)}s`, colors.green);

      return detection;
    }

    if (detection.status === 'FAILED') {
      log('\n✗ Detection failed!', colors.red);
      log(`   Error: ${detection.error_message}`, colors.red);
      return detection;
    }

    if (i < maxAttempts - 1) {
      await sleep(intervalMs);
    }
  }

  log(`\n✗ Timeout: Detection did not complete within ${maxAttempts * intervalMs/1000}s`, colors.red);
  const finalStatus = await getDetectionStatus(token, detectionId);
  log(`   Final status: ${finalStatus.status}`, colors.yellow);
  return finalStatus;
}

async function getAllDetections(token) {
  try {
    log('\n4. Getting all user detection requests...', colors.blue);

    const response = await axios.get(
      `${API_BASE_URL}/disease/requests`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    const { count, detections } = response.data.data;
    log(`✓ Found ${count} detection requests`, colors.green);

    if (count > 0) {
      log(`\n   Recent detections:`, colors.blue);
      detections.slice(0, 5).forEach((det, idx) => {
        log(`   ${idx + 1}. [${det.status}] ${det.detected_disease || 'Processing...'} - ${new Date(det.uploaded_at).toLocaleString()}`, colors.yellow);
      });
    }

    return detections;
  } catch (error) {
    log(`✗ Failed to get all detections: ${error.message}`, colors.red);
    throw error;
  }
}

async function getImageUrl(token, detectionId) {
  try {
    log('\n5. Getting presigned URL for image...', colors.blue);

    const response = await axios.get(
      `${API_BASE_URL}/disease/requests/${detectionId}/image`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    const { imageUrl, expiresIn, expiresAt } = response.data.data;
    log(`✓ Presigned URL generated!`, colors.green);
    log(`   URL: ${imageUrl.substring(0, 80)}...`, colors.magenta);
    log(`   Expires in: ${expiresIn}s (${new Date(expiresAt).toLocaleString()})`, colors.yellow);

    return imageUrl;
  } catch (error) {
    log(`✗ Failed to get image URL: ${error.message}`, colors.red);
    throw error;
  }
}

async function main() {
  log('='.repeat(80), colors.blue);
  log('Disease Detection System - End-to-End Test', colors.blue);
  log('='.repeat(80), colors.blue);

  try {
    // Step 1: Login
    const token = await login();

    // Step 2: Submit detection request
    const detectionId = await submitDetectionRequest(token);

    // Step 3: Poll for results
    const detection = await pollDetectionStatus(token, detectionId);

    // Step 4: Get all detections
    await getAllDetections(token);

    // Step 5: Get image URL
    await getImageUrl(token, detectionId);

    log('\n' + '='.repeat(80), colors.green);
    log('✓ All tests completed successfully!', colors.green);
    log('='.repeat(80), colors.green);

  } catch (error) {
    log('\n' + '='.repeat(80), colors.red);
    log('✗ Test failed!', colors.red);
    log('='.repeat(80), colors.red);
    console.error(error);
    process.exit(1);
  }
}

// Run the test
main();
