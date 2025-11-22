/*
 * adc2&adc3.c
 *
 *  Created on: Jul 9, 2025
 *      Author: mbuse
 */


#include "adc2&adc3.h"
#include "adc.h"

extern uint16_t ADC2_Values[11];
extern uint16_t ADC3_Values[7];

float adc203, adc209, adc213, adc204, adc207;
float adc206, adc205, adc200, adc215, adc208;
float adc214, adc212, adc210;

float adc309, adc315, adc308, adc306;
float adc305, adc307, adc314;

void UpdateADC2(void)
{
    adc203 = ADC2_Values[0];
    adc210 = ADC2_Values[1];
    adc213 = ADC2_Values[2];
    adc204 = ADC2_Values[3];
    adc207 = ADC2_Values[4];
    adc206 = ADC2_Values[5];
    adc205 = ADC2_Values[6];
    adc200 = ADC2_Values[7];
    adc215 = ADC2_Values[8];
    adc208 = ADC2_Values[9];
    adc214 = ADC2_Values[10];
    adc212 = ADC2_Values[11];
}

void UpdateADC3(void)
{
	adc309 = ADC3_Values[0];
	adc315 = ADC3_Values[1];
	adc308 = ADC3_Values[2];
	adc306 = ADC3_Values[3];
	adc305 = ADC3_Values[4];
	adc307 = ADC3_Values[5];
	adc314 = ADC3_Values[6];
}
