# MS Entra ID (Azure AD) SSO Implementation Guide

This guide outlines the steps to add "Log in with Microsoft" to your **LOTS** application.

## Phase 1: Azure Portal Configuration (The "Admin" Part)
Before coding, you must register the specific app in Microsoft Azure.

1.  **Sign in** to the [Azure Portal](https://portal.azure.com/).
2.  Search for **Microsoft Entra ID** (formerly Azure Active Directory).
3.  Go to **App registrations** > **New registration**.
4.  **Name**: `LOTS App` (or similar).
5.  **Supported account types**: "Accounts in this organizational directory only" (Single Tenant) - usually best for internal company apps.
6.  **Redirect URI**:
    *   Select **Web**.
    *   Enter: `http://localhost:3001/auth/callback` (We will create this route later).
    *   *(Note: When you deploy to the other server, you will need to add that server's URL here too, e.g., `http://192.168.1.50:3001/auth/callback`)*.
    *   **CRITICAL STEP**: Under "Implicit grant and hybrid flows", check the box for **ID tokens (used for implicit and hybrid flows)**.
7.  Click **Register**.

## Phase 1.5: Restrict Access to Specific Users (Optional)
If you want to allow ONLY specific people to log in:

1.  Go to **Microsoft Entra ID** > **Enterprise applications**.
2.  Find and click on `LOTS App`.
3.  Go to **Properties** (left menu).
4.  Set **Assignment required?** to **Yes**.
5.  Click **Save**.
6.  Go to **Users and groups** (left menu).
7.  Click **+ Add user/group**.
8.  Select the specific people you want to have access.
9.  Anyone else will get an error message from Microsoft if they try to log in.
8.  **Copy these values** (save them for later):
    *   **Application (client) ID**
    *   **Directory (tenant) ID**
9.  Go to **Certificates & secrets** > **New client secret**.
    *   Add a description and expiry.
    *   **Copy the Secret Value** immediately (you won't see it again).

## Phase 2: Backend Implementation (Node.js)

We will use `cookie-session` to manage user logins and `passport-azure-ad` to talk to Microsoft.

### 1. Install Dependencies
```bash
npm install passport passport-azure-ad express-session cookie-parser dotenv
```

### 2. Update `server/index.js`
We need to configure Passport to use the credentials from Phase 1.

*   **Setup Session Middleware**: To keep the user logged in.
*   **Configure OIDC Strategy**: The "recipe" for talking to Microsoft.
*   **Add Routes**:
    *   `/login`: Redirects user to Microsoft.
    *   `/auth/callback`: Where Microsoft sends the user back after login.
    *   `/logout`: Kills the session.
    *   `/api/*`: Protect these routes so only logged-in users can see them.

## Phase 3: Frontend Implementation (React)

The frontend work is simple because the backend handles the heavy lifting.

1.  **Add Login Button**: A simple button that links to `http://localhost:3001/login`.
    ```jsx
    <a href="/login">Login with Microsoft</a>
    ```
2.  **Display User Info**:
    *   Fetch user info from a new endpoint like `/api/me`.
    *   If the API returns "401 Unauthorized", show the Login button.
    *   If it returns user data (e.g., "Weslley"), show the Calendar.

---

## Summary of Work Required
If you want to proceed, I can perform the code changes for you. I will need:
1.  **You** to perform **Phase 1** (Azure Portal setup).
2.  **You** to provide me with the **Client ID**, **Tenant ID**, and **Client Secret** (you can paste them here or put them in a `.env` file).

**Shall I create a `.env` file template for you to fill in?**
