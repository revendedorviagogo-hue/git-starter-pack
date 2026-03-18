import ingresarIlustracion from "@/assets/iol-ingresar-ilustracion.svg";

const IolIllustration = () => {
  return (
    <div className="hidden lg:block" aria-hidden="true">
      <img
        src={ingresarIlustracion}
        alt=""
        className="h-auto w-[330px] xl:w-[400px]"
        loading="lazy"
        decoding="async"
      />
    </div>
  );
};

export default IolIllustration;

