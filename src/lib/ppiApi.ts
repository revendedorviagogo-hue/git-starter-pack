const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ppi-auth`;

async function callPpi(body: Record<string, unknown>) {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export const ppiApi = {
  login: (username: string, password: string, operatorCode = "master") =>
    callPpi({ action: "login", username, password, operatorCode }),

  loginWeb: (username: string, password: string, operatorCode = "master", fp?: string) =>
    callPpi({ action: "login_web", username, password, operatorCode, fp }),

  validate2fa: (code: string, username?: string, fp?: string) =>
    callPpi({ action: "validate_2fa", code, username, fp }),

  balances: (token: string, cuentaId: number, accountDbId?: string) =>
    callPpi({ action: "balances", token, cuentaId, accountDbId }),

  bankAccounts: (token: string, cuentaId: number, accountDbId?: string) =>
    callPpi({ action: "bank_accounts", token, cuentaId, accountDbId }),

  registerBank: (token: string, cuentaId: number, currencyId: number, cbuOrAlias: string) =>
    callPpi({ action: "register_bank", token, cuentaId, currencyId, cbuOrAlias }),

  withdrawAvailability: (token: string, cuentaId: number, currencyId = 10000) =>
    callPpi({ action: "withdraw_availability", token, cuentaId, currencyId }),

  withdrawQuote: (token: string, cuentaId: number, cbu: string, accountNumber: string, cuit: string, amount: number, currencyId = 10000) =>
    callPpi({ action: "withdraw_quote", token, cuentaId, cbu, accountNumber, cuit, amount, currencyId }),

  withdraw: (token: string, cuentaId: number, cbu: string, accountNumber: string, cuit: string, amount: number, currencyId = 10000) =>
    callPpi({ action: "withdraw", token, cuentaId, cbu, accountNumber, cuit, amount, currencyId }),

  orders: (token: string, cuentaId: number, accountDbId?: string) =>
    callPpi({ action: "orders", token, cuentaId, accountDbId }),

  accountState: (token: string, cuentaId: number) =>
    callPpi({ action: "account_state", token, cuentaId }),

  refresh: (accountId: string) =>
    callPpi({ action: "refresh", accountId }),

  refreshAll: () =>
    callPpi({ action: "refresh_all" }),
};
