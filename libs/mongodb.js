import mongoose from "mongoose";

const connectMongoDB = async () => {
    try{
        await mongoose.connect("mongodb+srv://cutiefunny:ghks1015@macrodb.srkli.mongodb.net/catSurvival?retryWrites=true&w=majority");
    }catch(error){
        console.log(error);
    }
};

export default connectMongoDB;