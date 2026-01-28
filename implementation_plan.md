# Implementation Plan - Microsoft SSO

We will implement Single Sign-On (SSO) using Microsoft Entra ID (Azure AD) to secure the application.

## User Review Required
> [!IMPORTANT]
> You must fill in the `.env` file with your **Client ID**, **Tenant ID**, and **Client Secret** before the app will work.

## Proposed Changes

### Backend Dependencies
*   Install: `passport`, `passport-azure-ad`, `express-session`, `cookie-parser`, `dotenv`

### Backend Code (`server/index.js`)
*   **Load Environment Variables**: Configure `dotenv`.
*   **Session Setup**: Initialize `express-session` to maintain user state.
*   **Passport Setup**: Configure `OIDCStrategy` with Azure credentials.
*   **Routes**:
    *   `GET /login`: Start authentication.
    *   `POST /auth/callback`: Handle return from Microsoft.
    *   `GET /api/me`: Return current user info.
    *   `GET /logout`: Destroy session.

### Frontend Code (`src/components/Calendar.jsx` & `src/App.jsx`)
*   **Check Login Status**: Application should fetch `/api/me` on load.
*   **Login UI**: If not logged in, show a "Login with Microsoft" button instead of the App.
*   **User Info**: Use the name returned from Microsoft to set the `currentUser` state automatically (replacing the hardcoded 'Weslley').

## Verification Plan

### Manual Verification
1.  **Start App**: Run `npm run dev` and `node server/index.js`.
2.  **Login**: Click "Login with Microsoft".
3.  **Redirect**: Validate that you are redirected to Microsoft login page.
4.  **Success**: After login, validate you are redirected back to the App and see your name.
5.  **Logout**: Click a "Logout" button (we will add one) and ensure session is cleared.
