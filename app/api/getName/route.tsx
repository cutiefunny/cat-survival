import { NextRequest, NextResponse } from 'next/server';
import connectMongoDB from '@/libs/mongodb';
import Rank from '@/models/rank';

export async function GET(request: NextRequest): Promise<NextResponse> {
    const searchParams = request.nextUrl.searchParams
    const deviceId = searchParams.get('deviceId')
    try {
        await connectMongoDB();
        let rank = await Rank.findOne({ deviceId: deviceId }).sort({ createTm: -1 });
        const ranks = await Rank.find({ deviceId: deviceId }).sort({ createTm: -1 });

        if (ranks.length > 1) {
            rank = ranks[0];
        }
        if (!rank) {
            return NextResponse.json({ name: '' }, { status: 200 });
        }
        return NextResponse.json({ name: rank.name }, { status: 200 });
    } catch (error: any) {
        console.error('Error fetching ranks:', error);
        return NextResponse.json({ message: 'Error fetching ranks' }, { status: 500 });
    }
}