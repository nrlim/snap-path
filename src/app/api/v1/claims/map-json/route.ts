import { NextRequest, NextResponse } from 'next/server';
import { getAIGateway } from '@/lib/ai/gateway';

/**
 * POST /api/v1/claims/map-json
 * Receives an arbitrary JSON object from any hospital system (SIMRS, FHIR, HL7, custom export)
 * and uses AI to intelligently map it to SnapPath's ClaimValidationInput schema.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Request body must be a valid JSON object.' },
        { status: 400 }
      );
    }

    const gateway = await getAIGateway();
    const { data, usage } = await gateway.mapArbitraryJsonToClaim(body);

    return NextResponse.json({
      success: true,
      mapped: data,
      _mappingNotes: data._mappingNotes,
      usage,
    });
  } catch (err: any) {
    console.error('[map-json] Error:', err);
    return NextResponse.json(
      { error: err.message || 'AI mapping failed.' },
      { status: 500 }
    );
  }
}
