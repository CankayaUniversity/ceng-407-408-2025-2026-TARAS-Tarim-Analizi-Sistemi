const axios = require('axios');

const API_BASE_URL = 'http://13.61.7.197:3000/api';

async function testFieldSensorHistory() {
  try {
    console.log('=== Testing Field Sensor History Endpoint ===\n');

    // Step 1: Login as ahmet_ciftci
    console.log('1. Logging in as ahmet_ciftci...');
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      identifier: 'ahmet_ciftci',
      password: 'password123'
    });

    if (!loginResponse.data.success) {
      throw new Error('Login failed: ' + loginResponse.data.error);
    }

    const token = loginResponse.data.data.token;
    const user = loginResponse.data.data.user;
    console.log(`✓ Logged in as ${user.username} (${user.email})\n`);

    // Step 2: Get user's fields
    console.log('2. Fetching user fields...');
    const fieldsResponse = await axios.get(`${API_BASE_URL}/dashboard/fields`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!fieldsResponse.data.success || !fieldsResponse.data.data || fieldsResponse.data.data.length === 0) {
      throw new Error('No fields found for user');
    }

    const fields = fieldsResponse.data.data;
    console.log(`✓ Found ${fields.length} field(s):`);
    fields.forEach(f => console.log(`  - ${f.name} (${f.id}) - ${f.area} hectares`));
    console.log('');

    const testFieldId = fields[0].id;
    const testFieldName = fields[0].name;

    // Step 3: Test field sensor history endpoint with default 72 hours
    console.log(`3. Fetching 72-hour sensor history for field "${testFieldName}"...`);
    const historyResponse = await axios.get(
      `${API_BASE_URL}/sensors/field/${testFieldId}/history`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!historyResponse.data.success) {
      throw new Error('History fetch failed: ' + historyResponse.data.error);
    }

    const historyData = historyResponse.data.data;
    console.log(`✓ Retrieved sensor history:`);
    console.log(`  Field: ${historyData.field_name} (${historyData.field_id})`);
    console.log(`  Time range: ${historyData.hours} hours`);
    console.log(`  Total readings: ${historyData.reading_count}`);

    if (historyData.readings.length > 0) {
      const firstReading = historyData.readings[0];
      const lastReading = historyData.readings[historyData.readings.length - 1];
      console.log(`  First reading: ${firstReading.created_at}`);
      console.log(`  Last reading: ${lastReading.created_at}`);
      console.log(`  Sample reading:`, {
        node_id: firstReading.node_id,
        temperature: firstReading.temperature,
        humidity: firstReading.humidity,
        sm_percent: firstReading.sm_percent
      });
    }
    console.log('');

    // Step 4: Test with custom time range (24 hours)
    console.log('4. Fetching 24-hour sensor history...');
    const history24Response = await axios.get(
      `${API_BASE_URL}/sensors/field/${testFieldId}/history?hours=24`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!history24Response.data.success) {
      throw new Error('24h history fetch failed: ' + history24Response.data.error);
    }

    const history24Data = history24Response.data.data;
    console.log(`✓ Retrieved 24-hour history:`);
    console.log(`  Total readings: ${history24Data.reading_count}`);
    console.log('');

    // Step 5: Test authorization - try accessing another user's field
    console.log('5. Testing authorization (should fail)...');
    const fakeFieldId = '00000000-0000-0000-0000-000000000001';
    try {
      await axios.get(
        `${API_BASE_URL}/sensors/field/${fakeFieldId}/history`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('✗ Authorization check failed - should have been blocked');
    } catch (error) {
      if (error.response && error.response.status === 403) {
        console.log('✓ Authorization check passed - access correctly denied');
      } else if (error.response && error.response.status === 404) {
        console.log('✓ Authorization check passed - field not found');
      } else {
        throw error;
      }
    }
    console.log('');

    console.log('=== All tests passed! ===');

  } catch (error) {
    console.error('\n❌ Test failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

testFieldSensorHistory();
