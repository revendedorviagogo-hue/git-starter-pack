import { useState } from "react";

interface UniLoginFormProps {
  onSubmit: (dni: string, password: string) => void;
  loading?: boolean;
}

const UniLoginForm = ({ onSubmit, loading }: UniLoginFormProps) => {
  const [dni, setDni] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (dni && password) onSubmit(dni, password);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full text-left">
      <div className="mb-5">
        <label className="block text-[14px] mb-1.5" style={{ color: "#3c3c3c" }}>
          DNI, NIE, Pasaporte o usuario
        </label>
        <input
          type="text"
          value={dni}
          onChange={(e) => setDni(e.target.value)}
          className="w-full h-[48px] px-3 rounded-[4px] text-[15px] focus:outline-none transition-colors"
          style={{ border: "2px solid #004b6e", color: "#333333", backgroundColor: "#ffffff" }}
          autoFocus
        />
      </div>

      <div className="mb-4">
        <label className="block text-[14px] mb-1.5" style={{ color: "#3c3c3c" }}>
          Clave de acceso
        </label>
        <div className="flex gap-2">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="flex-1 h-[48px] px-3 rounded-[4px] text-[15px] focus:outline-none transition-colors"
            style={{ border: "1px solid #c4c4c4", color: "#333333", backgroundColor: "#ffffff" }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="h-[48px] px-4 rounded-[4px] text-[14px] transition-colors"
            style={{ border: "1px solid #c4c4c4", color: "#555555", backgroundColor: "#f5f5f5" }}
          >
            Mostrar
          </button>
        </div>
      </div>

      <div className="mb-6">
        <button type="button" className="text-[14px] hover:underline font-normal" style={{ color: "#004b6e" }}>
          Recuperar clave de acceso
        </button>
      </div>

      <button
        type="submit"
        disabled={loading || !dni || !password}
        className="w-full h-[48px] text-[15px] font-medium rounded-[4px] transition-colors disabled:opacity-60"
        style={{ backgroundColor: "#004b6e", color: "#ffffff" }}
      >
        {loading ? "Accediendo..." : "Acceder"}
      </button>
    </form>
  );
};

export default UniLoginForm;
