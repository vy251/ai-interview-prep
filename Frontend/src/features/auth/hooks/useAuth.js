import { useContext,useEffect } from "react";
import { AuthContext } from "../auth.context.jsx";
import { login, register, logout, getMe } from "../services/auth.api.js";

export const useAuth = () => {
  const context = useContext(AuthContext);
  const { user, setUser, loading, setLoading } = context;

  const handleLogin = async ({ email, password }) => {
    setLoading(true);

    try {
        await login({ email, password });

        const data = await getMe();

        setUser(data.user);

        return true;
    } catch (err) {
        console.log(err);
        return false;
    } finally {
        setLoading(false);
    }
};

  const handleRegister = async ({ username, email, password }) => {
    setLoading(true);
    try {
      const data = await register({ username, email, password });
      setUser(data.user);
    } catch (err) {
      console.log(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      const data = await logout();
      setUser(null);
    } catch (err) {
      console.log(err);
    } finally {
      setLoading(false);
    }
  };

   useEffect(() => {
    const getAndSetUser = async () => {
        try {
            const data = await getMe();
            setUser(data.user);
        } catch (error) {
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    getAndSetUser();
}, []);

  return { user, loading, handleRegister, handleLogin, handleLogout };
};
