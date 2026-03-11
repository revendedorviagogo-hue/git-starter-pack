import Global66Logo from "./Global66Logo";

interface Props {
  email: string;
}

const Global66SyncEmailScreen = ({ email }: Props) => (
  <div className="flex w-full flex-col items-center gap-5 text-center">
    <Global66Logo size={56} />
    <h2 className="text-xl font-bold text-[#1a2233]">Sincronizando datos</h2>
    <p className="text-sm text-[#5a6a85]">{email}</p>
    <div className="flex items-center gap-2">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#2b4ea2] border-t-transparent" />
      <span className="text-sm text-[#5a6a85]">Consultando la seguridad de tu cuenta...</span>
    </div>
  </div>
);

export default Global66SyncEmailScreen;
