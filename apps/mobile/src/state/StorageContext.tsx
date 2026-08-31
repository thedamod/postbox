import { createContext, useContext, type ReactNode } from "react";

import { MobileStorage } from "../persistence/mobile-database";

const storage = new MobileStorage();

const StorageContext = createContext<MobileStorage>(storage);

export function StorageProvider({ children }: { children: ReactNode }) {
  return <StorageContext.Provider value={storage}>{children}</StorageContext.Provider>;
}

export function useStorage(): MobileStorage {
  return useContext(StorageContext);
}