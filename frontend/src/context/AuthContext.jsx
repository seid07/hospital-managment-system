import { useCallback, useMemo, useState } from "react";

import { login as loginRequest } from "../services/api";

import { AuthContext } from "./auth-context";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() =>
    localStorage.getItem("hospital_token"),
  );

  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem("hospital_user");

    if (!storedUser) {
      return null;
    }

    try {
      return JSON.parse(storedUser);
    } catch {
      localStorage.removeItem("hospital_user");
      return null;
    }
  });

  const login = useCallback(async (username, password) => {
    const response = await loginRequest(username, password);

    const { token: newToken, user: newUser } = response.data;

    localStorage.setItem("hospital_token", newToken);

    localStorage.setItem("hospital_user", JSON.stringify(newUser));

    setToken(newToken);
    setUser(newUser);

    return newUser;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("hospital_token");

    localStorage.removeItem("hospital_user");

    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token && user),
      login,
      logout,
    }),
    [token, user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
