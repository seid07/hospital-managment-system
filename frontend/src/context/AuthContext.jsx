import {
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";

import { login as loginRequest } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(
    () => localStorage.getItem("hospital_token")
  );

  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem("hospital_user");

    return storedUser
      ? JSON.parse(storedUser)
      : null;
  });

  async function login(username, password) {
    const response = await loginRequest(
      username,
      password
    );

    const { token, user } = response.data;

    localStorage.setItem("hospital_token", token);
    localStorage.setItem(
      "hospital_user",
      JSON.stringify(user)
    );

    setToken(token);
    setUser(user);

    return user;
  }

  function logout() {
    localStorage.removeItem("hospital_token");
    localStorage.removeItem("hospital_user");

    setToken(null);
    setUser(null);
  }

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token && user),
      login,
      logout,
    }),
    [token, user]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider."
    );
  }

  return context;
}
