import useAuth from "@/utils/useAuth";

export default function LogoutPage() {
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut({
      callbackUrl: "/",
      redirect: true,
    });
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#FFF7EF] p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-lg">
        <h1 className="mb-6 text-3xl font-bold text-[#3B241B]">Sign Out</h1>
        <p className="mb-8 text-[#7A6254]">
          Are you sure you want to sign out?
        </p>
        <button
          onClick={handleSignOut}
          className="w-full rounded-xl bg-[#FF6F61] px-4 py-3.5 text-base font-bold text-white shadow-md transition-all hover:bg-[#E85D51]"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
