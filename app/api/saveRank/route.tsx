import { NextRequest, NextResponse } from 'next/server';
import connectMongoDB from '@/libs/mongodb';
import Rank from '@/models/rank';

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const { name, deviceId, score }: { name: string; deviceId: string; score: number } = await request.json();
        
        if (!name || !deviceId || score === undefined) {
            return NextResponse.json({ message: 'Invalid input' }, { status: 400 });
        }

        await connectMongoDB();

        const existingRank = await Rank.findOne({ deviceId: deviceId, name: name });
        console.log('Existing Rank:', existingRank);
        console.log('New Score:', score);

        if (existingRank) {
            // If a rank with the same deviceId and name exists, update the score only if the new score is higher
            if (score > existingRank.score) {
                existingRank.score = score;
                existingRank.createTm = new Date(); // Update the creation time to the current time
                await existingRank.save();
            }
        } else {
            // If no existing rank is found, create a new rank
            const newRank = new Rank({
            name,
            deviceId,
            score,
            createTm: new Date(),
            });

            await newRank.save();
        }

        return NextResponse.json({ message: 'Rank saved successfully' }, { status: 201 });
    } catch (error: any) {
        console.error('Error saving rank:', error);
        return NextResponse.json({ message: 'Error saving rank' }, { status: 500 });
    }
}