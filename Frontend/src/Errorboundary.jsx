import React from 'react'

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null, errorInfo: null }
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error }
    }

    componentDidCatch(error, errorInfo) {
        console.error('App crashed:', error, errorInfo)
        this.setState({ errorInfo })
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    minHeight: '100vh',
                    background: '#0d1117',
                    color: '#e6edf3',
                    padding: '2rem',
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                }}>
                    <h1 style={{ color: '#ff4d4d' }}>Something crashed</h1>
                    <p><strong>{this.state.error && this.state.error.toString()}</strong></p>
                    <details style={{ marginTop: '1rem', opacity: 0.8 }}>
                        <summary>Component stack (click to expand)</summary>
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </details>
                    <button
                        onClick={() => window.location.href = '/login'}
                        style={{
                            marginTop: '1.5rem',
                            padding: '0.6rem 1.2rem',
                            background: '#ff2d78',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.4rem',
                            cursor: 'pointer'
                        }}
                    >
                        Go to Login
                    </button>
                </div>
            )
        }

        return this.props.children
    }
}

export default ErrorBoundary