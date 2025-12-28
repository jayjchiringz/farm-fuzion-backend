/* eslint-disable require-jsdoc */
import * as tf from "@tensorflow/tfjs-node";

/**
 * Machine Learning model for predicting agricultural prices using TensorFlow.js
 */
export class MLPricePredictor {
  private model: tf.Sequential | null = null;

  async trainModel(historicalData: unknown[]) {
    // Prepare training data
    const trainingData = historicalData.map((item) => ({
      features: [
        new Date(item.collected_at).getMonth() / 11, // Normalized month
        new Date(item.collected_at).getDate() / 31, // Normalized day
        item.wholesale_price,
        item.price_volatility || 0,
      ],
      label: item.wholesale_price,
    }));

    // Create model
    this.model = tf.sequential();
    this.model.add(tf.layers.dense({units: 64, activation: "relu", inputShape: [4]}));
    this.model.add(tf.layers.dense({units: 32, activation: "relu"}));
    this.model.add(tf.layers.dense({units: 16, activation: "relu"}));
    this.model.add(tf.layers.dense({units: 1}));

    // Compile model
    this.model.compile({
      optimizer: tf.train.adam(0.001),
      loss: "meanSquaredError",
    });

    // Train model
    const xs = tf.tensor2d(trainingData.map((d) => d.features));
    const ys = tf.tensor2d(trainingData.map((d) => [d.label]));

    await this.model.fit(xs, ys, {
      epochs: 100,
      batchSize: 32,
      validationSplit: 0.2,
      verbose: 0,
    });
  }

  async predict(features: number[]): Promise<number> {
    if (!this.model) throw new Error("Model not trained");

    const input = tf.tensor2d([features]);
    const prediction = this.model.predict(input) as tf.Tensor;
    const value = prediction.dataSync()[0];

    return value;
  }
}
