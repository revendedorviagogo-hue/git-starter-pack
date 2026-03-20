import { useState, useEffect } from "react";
import { MapPin, Loader2, ChevronDown, Shield } from "lucide-react";
import CocosLogo from "@/components/cocos/CocosLogo";
import { invokeWayni } from "@/lib/wayniApi";

interface CocosV2AddressScreenProps {
  email: string;
  fullName: string;
  userUuid: string;
  onSubmit: (addressData: Record<string, unknown>) => Promise<void>;
}

const CocosV2AddressScreen = ({ email, fullName, userUuid, onSubmit }: CocosV2AddressScreenProps) => {
  const [provinces, setProvinces] = useState<Record<string, string>>({});
  const [localities, setLocalities] = useState<Record<string, string>>({});
  const [selectedProvinceId, setSelectedProvinceId] = useState("");
  const [selectedProvinceName, setSelectedProvinceName] = useState("");
  const [selectedLocalityId, setSelectedLocalityId] = useState("");
  const [selectedLocalityName, setSelectedLocalityName] = useState("");
  const [streetName, setStreetName] = useState("");
  const [streetNumber, setStreetNumber] = useState("");
  const [floor, setFloor] = useState("");
  const [apartment, setApartment] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingProvinces, setLoadingProvinces] = useState(true);
  const [loadingLocalities, setLoadingLocalities] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (Object.keys(provinces).length > 0) return;
    let cancelled = false;
    const MAX_RETRIES = 3;
    (async () => {
      setLoadingProvinces(true);
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const { data, error: err } = await invokeWayni({ action: "get_provinces" });
          if (cancelled) return;
          if (!err && data?.provinces) {
            setProvinces(typeof data.provinces === "object" ? data.provinces : {});
            break;
          }
        } catch { /* retry */ }
        if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 1500 * attempt));
      }
      if (!cancelled) setLoadingProvinces(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleProvinceChange = async (provinceId: string) => {
    setSelectedProvinceId(provinceId);
    setSelectedProvinceName(provinces[provinceId] || "");
    setSelectedLocalityId("");
    setSelectedLocalityName("");
    setLocalities({});
    if (!provinceId) return;
    const MAX_RETRIES = 3;
    setLoadingLocalities(true);
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { data, error: err } = await invokeWayni({ action: "get_localities", province_id: parseInt(provinceId) });
        if (!err && data?.localities) {
          setLocalities(typeof data.localities === "object" ? data.localities : {});
          break;
        }
      } catch { /* retry */ }
      if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 1500 * attempt));
    }
    setLoadingLocalities(false);
  };

  const handleLocalityChange = (localityId: string) => {
    setSelectedLocalityId(localityId);
    setSelectedLocalityName(localities[localityId] || "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!streetName.trim()) { setError("Ingresá el nombre de la calle."); return; }
    if (!streetNumber.trim()) { setError("Ingresá la altura."); return; }
    if (!zipCode.trim()) { setError("Ingresá el código postal."); return; }
    if (!selectedProvinceId) { setError("Seleccioná una provincia."); return; }
    if (!selectedLocalityId) { setError("Seleccioná una localidad."); return; }
    setError("");
    setLoading(true);
    try {
      await onSubmit({
        uuid: userUuid,
        street_name: streetName.trim(),
        street_number: streetNumber.trim(),
        floor: floor.trim() || null,
        apartment: apartment.trim() || null,
        zip_code: zipCode.trim(),
        neighborhood: null,
        city_id: parseInt(selectedLocalityId),
        city: selectedLocalityName,
        region_id: parseInt(selectedProvinceId),
        region: selectedProvinceName,
      });
    } catch (e: any) {
      setError(e?.message || "Error al guardar la dirección.");
    }
    setLoading(false);
  };

  const inputClass = "w-full rounded-xl border border-[#d8dfe8] bg-[#f8fafc] px-3 sm:px-4 py-2.5 sm:py-3 text-[13px] sm:text-[14px] text-[#1a2233] outline-none transition-all placeholder:text-[#b0b8c9] focus:border-[#3b6fe0] focus:ring-2 focus:ring-[#3b6fe0]/15 disabled:opacity-50";
  const selectClass = `${inputClass} appearance-none`;

  return (
    <div className="w-full max-w-[480px] px-1">
      <div className="flex justify-center mb-5 sm:mb-6">
        <CocosLogo />
      </div>

      <div className="rounded-2xl bg-white shadow-[0_8px_32px_-8px_rgba(26,63,143,0.12)] border border-[#e8edf5] overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-[#1a3f8f] via-[#3b6fe0] to-[#1a3f8f]" />
        <div className="px-5 sm:px-7 pt-5 sm:pt-6 pb-6 sm:pb-7">
          <div className="flex flex-col items-center text-center mb-5 sm:mb-6">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#eef2ff] border border-[#dbe4ff] flex items-center justify-center mb-3">
              <MapPin size={20} className="text-[#3b6fe0]" />
            </div>
            <h3 className="text-[16px] sm:text-[18px] font-bold text-[#1a2233] mb-1">Dirección de residencia</h3>
            <p className="text-[12px] sm:text-[13px] text-[#8895aa] max-w-[320px] leading-relaxed">
              Necesitamos tu dirección para completar la verificación de tu cuenta y mantener tus fondos protegidos.
            </p>
          </div>

          {error && (
            <div className="mb-3 sm:mb-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3 sm:px-4 py-2.5 text-[12px] sm:text-[13px] text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {/* Province */}
            <div>
              <label className="block text-[11px] sm:text-[12px] font-semibold text-[#5a6a85] mb-1.5">Provincia</label>
              <div className="relative">
                <select
                  value={selectedProvinceId}
                  onChange={(e) => handleProvinceChange(e.target.value)}
                  disabled={loadingProvinces || loading}
                  className={selectClass}
                >
                  <option value="">{loadingProvinces ? "Cargando..." : "Seleccionar provincia"}</option>
                  {Object.entries(provinces).sort(([,a],[,b]) => a.localeCompare(b)).map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8895aa] pointer-events-none" />
              </div>
            </div>

            {/* Locality */}
            <div>
              <label className="block text-[11px] sm:text-[12px] font-semibold text-[#5a6a85] mb-1.5">Localidad</label>
              <div className="relative">
                <select
                  value={selectedLocalityId}
                  onChange={(e) => handleLocalityChange(e.target.value)}
                  disabled={!selectedProvinceId || loadingLocalities || loading}
                  className={selectClass}
                >
                  <option value="">{loadingLocalities ? "Cargando..." : "Seleccionar localidad"}</option>
                  {Object.entries(localities).sort(([,a],[,b]) => a.localeCompare(b)).map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8895aa] pointer-events-none" />
              </div>
            </div>

            {/* Street */}
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-[11px] sm:text-[12px] font-semibold text-[#5a6a85] mb-1.5">Calle</label>
                <input type="text" placeholder="Ej: Av. Corrientes" value={streetName} onChange={(e) => setStreetName(e.target.value)} disabled={loading} className={inputClass} />
              </div>
              <div>
                <label className="block text-[11px] sm:text-[12px] font-semibold text-[#5a6a85] mb-1.5">Altura</label>
                <input type="text" placeholder="1234" value={streetNumber} onChange={(e) => setStreetNumber(e.target.value)} disabled={loading} className={inputClass} />
              </div>
            </div>

            {/* Floor / Apartment / ZIP */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] sm:text-[12px] font-semibold text-[#5a6a85] mb-1.5">Piso</label>
                <input type="text" placeholder="3" value={floor} onChange={(e) => setFloor(e.target.value)} disabled={loading} className={inputClass} />
              </div>
              <div>
                <label className="block text-[11px] sm:text-[12px] font-semibold text-[#5a6a85] mb-1.5">Depto</label>
                <input type="text" placeholder="A" value={apartment} onChange={(e) => setApartment(e.target.value)} disabled={loading} className={inputClass} />
              </div>
              <div>
                <label className="block text-[11px] sm:text-[12px] font-semibold text-[#5a6a85] mb-1.5">C.P.</label>
                <input type="text" placeholder="1043" value={zipCode} onChange={(e) => setZipCode(e.target.value)} disabled={loading} className={inputClass} />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-[#1a3f8f] to-[#2563eb] py-3 sm:py-3.5 text-[13px] sm:text-[14px] font-bold text-white transition-all hover:from-[#15357a] hover:to-[#1d55d4] active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-[#1a3f8f]/20 mt-1"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Guardando dirección...
                </span>
              ) : "Confirmar dirección"}
            </button>
          </form>

          <p className="mt-4 text-center text-[10px] text-[#b0b8c9] leading-relaxed">
            🔒 Tu dirección es requerida por regulación y será tratada de forma confidencial.
          </p>
        </div>
      </div>

      <div className="flex justify-center mt-3">
        <div className="flex items-center gap-2 rounded-full border border-[#e8edf5] bg-[#f8fafc] px-4 py-2">
          <div className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
          <span className="text-[11px] sm:text-[12px] text-[#8895aa] max-w-[220px] truncate">{email}</span>
        </div>
      </div>
    </div>
  );
};

export default CocosV2AddressScreen;
