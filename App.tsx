import { StatusBar } from "expo-status-bar";

import HomeScreen from "./src/screens/HomeScreen/HomeScreen";

export default function App() {
  // HomeScreen holds the Skia canvas that draws <Room /> and the character.
  return (
    <>
      <StatusBar style="light" />
      <HomeScreen />
    </>
  );
}
