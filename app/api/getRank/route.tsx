import { NextRequest, NextResponse } from 'next/server';
import connectMongoDB from '@/libs/mongodb';
import Rank from '@/models/rank';

interface IRank {
    name: string;
    deviceId: string;
    score: number;
    createTm: Date;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        await connectMongoDB();
        const ranks: IRank[] = await Rank.find({}).sort({ score: -1 }).limit(10);
        return NextResponse.json(ranks, { status: 200 });
    } catch (error: any) {
        console.error('Error fetching ranks:', error);
        return NextResponse.json({ message: 'Error fetching ranks' }, { status: 500 });
    }
}