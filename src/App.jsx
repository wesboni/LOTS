import { useState, useEffect, Component } from 'react'
import './App.css'
import Calendar from './components/Calendar'

const USERS = ['Weslley', 'Andre', 'Cristian', 'Elizabell', 'Karl', 'Kenny', 'Lawrence', 'Luke', 'Michael'];

// -----------------------------------------------------------------------------
// Error Boundary Component
// Catches JavaScript errors anywhere in their child component tree,
// logs those errors, and displays a fallback UI instead of the component tree that crashed.
// -----------------------------------------------------------------------------
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // You can also log the error to an error reporting service
    this.setState({ error, errorInfo });
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', color: 'red', background: '#ffe6e6' }}>
          <h1>Something went wrong.</h1>
          <details style={{ whiteSpace: 'pre-wrap' }}>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  // --- State Management ---
  const [currentUser, setCurrentUser] = useState(null); // The currently authenticated user
  const [loading, setLoading] = useState(true); // Loading state for auth check
  const [authError, setAuthError] = useState(false); // Authentication error state

  // --- Admin Specific State ---
  const [adminMode, setAdminMode] = useState('DASHBOARD'); // Modes: 'DASHBOARD', 'MANAGER', 'EMPLOYEE'
  const [targetEmployee, setTargetEmployee] = useState(null); // Employee being impersonated

  // --- Authentication Check ---
  useEffect(() => {
    // Check key API endpoint to verify session status
    fetch('/api/me')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          const azureName = data.user.name;
          // Match Azure AD name against local USERS list for consistency
          // This ensures names like "Weslley Bonifacio" map to "Weslley"
          const matchedUser = USERS.find(u => azureName.toLowerCase().includes(u.toLowerCase()));

          if (matchedUser) {
            setCurrentUser(matchedUser);
          } else {
            // Fallback: Use first name if not in list
            setCurrentUser(azureName.split(' ')[0]);
          }
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Auth check failed", err);
        setAuthError(true);
        setLoading(false);
      });
  }, []);

  const handleLogin = () => {
    window.location.href = '/login';
  };

  const handleLogout = () => {
    window.location.href = '/logout';
  };

  if (loading) return <div>Loading...</div>;

  if (!currentUser) {
    return (
      <div className="login-container">
        <div className="login-box">
          <h2>Welcome to LOTS</h2>
          <p>Please log in with your company account.</p>

          <button
            className="login-btn"
            onClick={handleLogin}
          >
            Login with Microsoft
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // View Rendering Logic
  // ---------------------------------------------------------------------------

  // === ADMIN (WESLLEY) LOGIC ===
  // Weslley has a special dashboard with Manager (All Data) and Impersonation capabilities
  if (currentUser === 'Weslley') {
    // 1. Dashboard View
    if (adminMode === 'DASHBOARD') {
      return (
        <div className="dashboard-container" style={{ padding: '2rem', textAlign: 'center' }}>
          <h1>Welcome, Weslley</h1>
          <p>Please select a view:</p>
          <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '2rem' }}>
            <button
              style={{ padding: '20px 40px', fontSize: '1.2rem', cursor: 'pointer' }}
              onClick={() => setAdminMode('MANAGER')}
            >
              Manager View (All Data)
            </button>
            <button
              style={{ padding: '20px 40px', fontSize: '1.2rem', cursor: 'pointer' }}
              onClick={() => setAdminMode('EMPLOYEE')}
            >
              Employee View (Impersonate)
            </button>
          </div>
          <button onClick={handleLogout} style={{ marginTop: '2rem', background: '#ccc' }}>Logout</button>
        </div>
      );
    }

    // 2. Employee Selection View
    if (adminMode === 'EMPLOYEE' && !targetEmployee) {
      return (
        <div className="dashboard-container" style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Select Employee to View</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '300px', margin: '2rem auto' }}>
            {USERS.filter(u => u !== 'Weslley').map(user => (
              <button
                key={user}
                onClick={() => setTargetEmployee(user)}
                style={{ padding: '10px', fontSize: '1rem', cursor: 'pointer' }}
              >
                {user}
              </button>
            ))}
          </div>
          <button onClick={() => setAdminMode('DASHBOARD')}>Back to Dashboard</button>
        </div>
      );
    }

    // 3. Render Calendar (Manager or Impersonated User)
    const effectiveUser = adminMode === 'MANAGER' ? 'Weslley' : targetEmployee;

    return (
      <div style={{ paddingBottom: '50px', width: '100%' }}>
        <div style={{ background: '#f0f0f0', padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>
            <strong>View Mode:</strong> {adminMode === 'MANAGER' ? 'Manager' : `Impersonating ${targetEmployee}`}
          </span>
          <button
            onClick={() => {
              setAdminMode('DASHBOARD');
              setTargetEmployee(null);
            }}
            style={{ padding: '5px 10px' }}
          >
            Back to Dashboard
          </button>
        </div>
        <ErrorBoundary>
          <Calendar currentUser={effectiveUser} />
        </ErrorBoundary>
      </div>
    );
  }

  // === REGULAR USER LOGIC ===
  // Standard view for non-admin users: only sees their own data (enforced by component props)
  return (
    <div style={{ paddingBottom: '50px', width: '100%' }}>
      <div style={{ textAlign: 'right', padding: '10px' }}>
        <span>Logged in as: <strong>{currentUser}</strong></span>
        <button onClick={handleLogout} style={{ marginLeft: '10px' }}>Logout</button>
      </div>
      <ErrorBoundary>
        <Calendar currentUser={currentUser} />
      </ErrorBoundary>
    </div>
  )
}

export default App
