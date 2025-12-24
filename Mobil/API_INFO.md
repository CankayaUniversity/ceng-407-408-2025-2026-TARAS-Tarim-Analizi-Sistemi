# API Configuration

## Backend URL
The app connects to: `http://localhost:3000/api`

## Demo Credentials
For testing, use these credentials:
- **Email/Username**: `tarasdemo` or `tarascankaya25@gmail.com`
- **Password**: `demo123`

## API Endpoints Used

### Authentication
- **POST** `/api/auth/login` - User login
- **POST** `/api/auth/register` - User registration  
- **GET** `/api/auth/me` - Get current user profile
- **POST** `/api/auth/change-password` - Change password

## Token Storage
Authentication tokens are securely stored using `@react-native-async-storage/async-storage`.

## Features Implemented
✅ Login with email/username
✅ Secure token storage
✅ Auto-login on app restart
✅ Logout functionality
✅ Error handling
✅ Loading states
✅ Input validation

## Testing the Connection
1. Make sure your backend is running on `http://localhost:3000`
2. Use the demo credentials above
3. The app will save your token and auto-login next time

**Note**: If testing on a physical device, you may need to update the API_BASE_URL in `src/utils/api.ts` to use your computer's IP address instead of `localhost`.
