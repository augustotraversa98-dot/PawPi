import * as React from 'react';
import { useSession } from "@auth/create/react";


const useUser = () => {
  const { data: session, status } = useSession();
  const id = session?.user?.id

  const [user, setUser] = React.useState(session?.user ?? null);

  const fetchUser = React.useCallback(async (session) => {
  return session?.user;
}, [])

  const refetchUser = React.useCallback(() => {
    if(process.env.NEXT_PUBLIC_CREATE_ENV === "PRODUCTION") {
      if (id) {
        fetchUser(session).then(setUser);
      } else {
        setUser(null);
      }
    }
  }, [fetchUser, id])

  React.useEffect(refetchUser, [refetchUser]);

  if (process.env.NEXT_PUBLIC_CREATE_ENV !== "PRODUCTION") {
    // Dev: the `user` useState is never updated in this branch (setUser only
    // runs in the PRODUCTION refetch), so it stays stuck at its initial value
    // (null while the session was still loading on first render). Return the
    // LIVE session user instead so authenticated callers aren't treated as
    // logged out. `data`/`loading` unchanged.
    return { user: session?.user ?? null, data: session?.user || null, loading: status === 'loading', refetch: refetchUser };
  }
  return { user, data: user, loading: status === 'loading' || (status === 'authenticated' && !user), refetch: refetchUser };
};

export { useUser }

export default useUser;