import { useState, useEffect, Component, ReactNode } from 'react'
import './App.css'
import Dashboard from './components/Dashboard'
import { User, Employee } from './types'
import { formatEmployeeName } from './utils';

// -----------------------------------------------------------------------------
// Error Boundary Component
// -----------------------------------------------------------------------------
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(_error: Error): ErrorBoundaryState {
    return { hasError: true, error: _error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
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

interface UserAuth {
  authenticated: boolean;
  user: User;
}

function App() {
  // --- State Management ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [realUser, setRealUser] = useState<User | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [, setAuthError] = useState<boolean>(false);

  // --- Fetch Data ---
  useEffect(() => {
    Promise.all([
      fetch('/api/me').then(res => res.json()),
      fetch('/api/employees').then(res => res.json())
    ]).then(([authData, empData]: [UserAuth, { data: Employee[] }]) => {
      console.log("DEBUG: Auth check response:", authData);
      console.log("DEBUG: Employees response:", empData);

      const allEmployees = empData.data || [];
      setEmployees(allEmployees);

      if (authData.authenticated) {
        console.log("DEBUG: User is authenticated. Setting current user:", authData.user);
        // Identify user from API response
        // API/me returns enriched user with employee_id etc.
        const apiUser = authData.user;

        // Re-derive to ensure consistent object structure if needed? 
        // Actually api/me is good.

        setCurrentUser(apiUser);
        setRealUser(apiUser);
      } else {
        console.warn("DEBUG: User NOT authenticated according to API.");
      }
      setLoading(false);
    })
      .catch(err => {
        console.error("DEBUG: Auth check failed / Promise rejected", err);
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

  const handleImpersonate = async (name: string, empId: number) => {
    if (confirm(`Switch view to ${name}?`)) {
      setLoading(true);
      try {
        const res = await fetch(`/api/user-context/${empId}`);
        if (!res.ok) throw new Error("Failed to fetch user context");
        const newUserCtx: User = await res.json();
        setCurrentUser(newUserCtx);
      } catch (err) {
        console.error("Impersonation failed", err);
        alert("Failed to switch user context.");
      } finally {
        setLoading(false);
      }
    }
  };



  // Check if real user allows impersonation (Admin/Weslley)
  const canImpersonate = realUser && realUser.is_admin;

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

  // === MAIN RENDER ===
  // Dashboard handles role logic (Manager/Employee views)
  return (
    <div style={{ paddingBottom: '50px', width: '100%' }}>
      <div style={{ textAlign: 'right', padding: '10px', background: '#f5f5f5', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {canImpersonate && (
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              <span style={{ marginRight: '10px', fontWeight: 'bold' }}>Impersonate:</span>
              {employees.map(e => (
                <button
                  key={e.id}
                  onClick={() => handleImpersonate(e.name, e.id)}
                  style={{
                    padding: '2px 6px',
                    fontSize: '0.8rem',
                    backgroundColor: currentUser.name === e.name ? '#0078d4' : '#e1e1e1',
                    color: currentUser.name === e.name ? 'white' : 'black',
                    border: '1px solid #ccc',
                    cursor: 'pointer'
                  }}
                >
                  {formatEmployeeName(e.name)}
                </button>
              ))}
              <button onClick={() => realUser && setCurrentUser(realUser)} style={{ marginLeft: '10px', fontSize: '0.8rem' }}>Reset</button>
            </div>
          )}
        </div>
        <div>
          <span>Logged in as: <strong>{formatEmployeeName(currentUser.name)}</strong> {realUser && realUser.name !== currentUser.name && <span style={{ color: 'red' }}>(via {formatEmployeeName(realUser.name)})</span>}</span>
          <button onClick={handleLogout} style={{ marginLeft: '10px' }}>Logout</button>
        </div>
      </div>
      <ErrorBoundary>
        <Dashboard currentUser={currentUser} />
      </ErrorBoundary>
    </div>
  )
}

export default App
