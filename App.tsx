import { StatusBar } from "expo-status-bar";

import HomeScreen from "./src/screens/HomeScreen/HomeScreen";

export default function App() {
  // HomeScreen mounts the active scene (village / room) and its Skia canvas.
  return (
    <>
      <StatusBar style="light" />
      <HomeScreen />
    </>
  );
}
