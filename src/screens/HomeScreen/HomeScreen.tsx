import { Canvas, Circle } from "@shopify/react-native-skia";
import { StyleSheet, View } from "react-native";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Canvas style={styles.canvas}>
        <Circle cx={200} cy={300} r={50} color="green" />
        <Circle cx={200} cy={200} r={70} color="indigo" />
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  canvas: {
    flex: 1,
  },
});
