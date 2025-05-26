import mongoose, { Schema } from "mongoose";

const rankSchema = new Schema({
    name: { type: String, required: true },
    deviceId: { type: String, required: true },
    score: { type: Number, required: true },
    createTm: { type: Date, default: Date.now },
});

const Rank = mongoose.models.Rank || mongoose.model("Rank", rankSchema);

export default Rank;